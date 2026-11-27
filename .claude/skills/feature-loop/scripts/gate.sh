#!/usr/bin/env bash
# gate.sh — feature-loop Stage 3 Phase A: deterministic compile gate (no LLM).
#
# Lint + typecheck + tests for what THIS FEATURE changed, the Files-touched
# allowlist, and related-feature regression tests. Prints a short summary; full
# logs go to files so the coordinator never pulls thousands of lines into context.
#
# Check usage (both lists required — the gate fails closed):
#   gate.sh --out <dir> --base <sha> --baseline <tsv> --allowlist <file>
#           [--also-tests <file>] [--since <hashes.tsv>] [--full] [--project <dir>]
# Baseline usage (no checks run):
#   gate.sh --write-baseline <tsv> --base <sha> [--project <dir>]
#       once, at Stage-2 start; refuses if <tsv> already exists
#   gate.sh --write-baseline <tsv> --base <sha> --since <hashes.tsv> --allowlist <file> [--include-code]
#       after a check round / feature-qa: records what changed since <hashes.tsv> outside the
#       allowlist as not-this-feature — reports, docs, config; code and schema files only with
#       --include-code (feature-qa's specs), otherwise listed as `unexpected-code:` and left
#       for the allowlist check. Allowlisted paths are never recorded; ones edited since the
#       snapshot are listed as `allowlisted-changed:` (someone other than the implementer).
#       Baseline writes take a lock (<tsv>.lock) so concurrent runs cannot lose entries.
#
#   --project     dir that holds .claude/specs/ (default: cwd); may be a subdir of the
#                 git repo. Every path in every list is relative to it. Paths outside it
#                 are written `@repo/<repo-relative path>` (allowlist them that way, or
#                 they are violations).
#   --base        commit the feature started from (state.yaml base_sha).
#   --baseline    TSV `path<TAB>hash` of changes that are NOT this feature's (work that was
#                 dirty at start, earlier queued features, feature-qa / check-agent output).
#                 Ignored while the hash is unchanged. Files the gate's own checks create
#                 (e.g. tsc -b output) get hash `*` = ignored whatever their content; a
#                 not-this-feature file a check rewrites is re-recorded with its new hash.
#                 Allowlisted paths are never baselined by a check run.
#   --allowlist   Files-touched allowlist, one path per line (`# comments` allowed); a
#                 line ending in "/" allows everything under it (Generated dirs only).
#   --also-tests  related features' regression tests, one path per line.
#   --since       hashes.tsv from an earlier gate run → changed-since.txt (incremental).
#   --full        full test suites (workspace-wide where configured). Final candidate.
#
# Writes to --out: summary.md, one log per check, hashes.tsv (this feature's paths and
# content hashes at the END of the run, i.e. after any fixes the checks applied),
# feature.diff (baseline-filtered diff for review agents, also end-of-run),
# changed-since.txt, files-touched-violations.txt.
#
# Coverage — skip is not pass: every changed CODE file must be examined by a static
# check that actually ran (typecheck, lint, syntax, vet/build); tests that find nothing
# do not count; coverage is per package (one package typecheck/lint covers its files).
# Uncovered code, code outside the project, or no change attributable to the feature
# → INCOMPLETE. Non-code changes (manifests, lockfiles, tsconfig, data, schema) still
# trigger their package's checks, with full test suites. Schema/infra files (sql, prisma,
# graphql, proto, tf) are also listed as `unchecked:` — Phase B reviews them.
#
# Project override: <project>/.claude/specs/_gate.cmds, lines `name: command` (`#` lines
# are comments; any other line without `name: command` → exit 2). Replaces the
# auto-detection; at least one line must run when code changed. Commands run from the
# project with GATE_CHANGED (file of changed paths) and GATE_FULL=1|0. A line named
# `regression` gets the --also-tests paths appended as arguments.
#
# Classes: `files-touched` and `regression-missing` FAILs are BLOCK-class (verdict
# block); every other FAIL is HEAL-class (self-heal loop). A check that times out is
# FAIL with "(timeout)" in its line.
# Exit: 0 PASS · 1 FAIL · 3 INCOMPLETE · 2 usage / missing input (coordinator error).
# Env: GATE_CHECK_TIMEOUT seconds per check (default 300); GATE_TOTAL_BUDGET seconds for
# the whole run (default 540, under a 600 s tool timeout) — checks that do not fit are
# reported uncovered (INCOMPLETE), never as code failures. Portable: macOS bash 3.2.

set -o pipefail
set -m   # each check runs in its own process group so a timeout kills the whole tree

INV="$(pwd)"
OUT="" BASE="HEAD" ALLOW="" ALSO="" PROJECT="" BASELINE="" WRITE_BL="" SINCE="" FULL=0 INCLUDE_CODE=0
TIMEOUT="${GATE_CHECK_TIMEOUT:-300}" BUDGET="${GATE_TOTAL_BUDGET:-540}" GATE_START="$(date +%s)"
die() { echo "gate: $*" >&2; exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    --allowlist) ALLOW="$2"; shift 2 ;;
    --also-tests) ALSO="$2"; shift 2 ;;
    --baseline) BASELINE="$2"; shift 2 ;;
    --write-baseline) WRITE_BL="$2"; shift 2 ;;
    --since) SINCE="$2"; shift 2 ;;
    --full) FULL=1; shift ;;
    --include-code) INCLUDE_CODE=1; shift ;;
    --project|--root) PROJECT="$2"; shift 2 ;;
    -h|--help) sed -n '2,52p' "$0"; exit 0 ;;
    *) die "unknown arg $1" ;;
  esac
done
abs() { case "$1" in ""|/*) printf '%s' "$1" ;; *) printf '%s/%s' "$INV" "$1" ;; esac; }
OUT="$(abs "$OUT")" ALLOW="$(abs "$ALLOW")" ALSO="$(abs "$ALSO")" BASELINE="$(abs "$BASELINE")"
WRITE_BL="$(abs "$WRITE_BL")" SINCE="$(abs "$SINCE")"
PROJECT="$(cd "$(abs "${PROJECT:-.}")" 2>/dev/null && pwd)" || die "project dir not found"
TOP="$(git -C "$PROJECT" rev-parse --show-toplevel 2>/dev/null)" || die "not inside a git repo"
PREFIX="$(git -C "$PROJECT" rev-parse --show-prefix)"
git -C "$PROJECT" rev-parse --verify --quiet "$BASE^{commit}" >/dev/null || die "unknown --base $BASE"
for pair in "allowlist:$ALLOW" "also-tests:$ALSO" "baseline:$BASELINE" "since:$SINCE"; do
  f="${pair#*:}"; [ -z "$f" ] || [ -f "$f" ] || die "--${pair%%:*} file not found: $f"
done
if [ -n "$WRITE_BL" ]; then
  if [ -n "$SINCE" ]; then [ -n "$ALLOW" ] || die "--write-baseline --since needs --allowlist (allowlisted paths are never baselined)"
  else [ ! -e "$WRITE_BL" ] || die "baseline $WRITE_BL already exists — it is written once per feature; use --since to add QA output"; fi
else
  [ -n "$OUT" ] || die "--out is required"
  [ -n "$ALLOW" ] || die "--allowlist is required (verdict rule 1)"
  [ -n "$BASELINE" ] || die "--baseline is required (write it at Stage-2 start with --write-baseline)"
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/gate.XXXXXX")" || die "mktemp failed"
LOCKED="" CUR_PID="" CUR_WD="" ARTS_READY=0 ARTS_DONE=0
lock_bl() { # $1 baseline file — mkdir is atomic; wait up to 120 s
  local n=0; until mkdir "$1.lock" 2>/dev/null; do
    n=$((n + 1)); [ $n -gt 120 ] && { echo "gate: baseline lock $1.lock held for 120 s — remove it if no gate is running" >&2; exit 2; }
    sleep 1; done; LOCKED="$1.lock"
}
unlock_bl() { [ -n "$LOCKED" ] && rmdir "$LOCKED" 2>/dev/null; LOCKED=""; }
on_exit() {
  local rc=$?
  set +m   # no job notifications while tearing down
  [ -n "$CUR_PID" ] && { kill -TERM -- -"$CUR_PID" 2>/dev/null; wait "$CUR_PID" 2>/dev/null; }
  [ -n "$CUR_WD" ] && { kill -TERM -- -"$CUR_WD" 2>/dev/null; wait "$CUR_WD" 2>/dev/null; }
  [ "$ARTS_READY" = 1 ] && [ "$ARTS_DONE" = 0 ] && record_artifacts
  unlock_bl; rm -rf "$TMP"; exit $rc
}
trap on_exit EXIT
trap 'exit 130' INT TERM
cd "$PROJECT" || die "cannot cd to $PROJECT"
TAB="$(printf '\t')"

clean_list() { # strip full-line and trailing " # comments", blanks, ./ ; tolerate no final newline
  sed -e 's/^[[:space:]]*#.*//' -e 's/[[:space:]]#.*$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's|^\./||' "$1" | grep -v '^$'
}
top_path() { case "$1" in @repo/*) printf '%s' "${1#@repo/}" ;; *) printf '%s%s' "$PREFIX" "$1" ;; esac; }
hash_of() { # path → blob hash, "-" when deleted
  local f="$TOP/$(top_path "$1")"
  if [ -f "$f" ] || [ -L "$f" ]; then git -C "$TOP" hash-object -- "$f" 2>/dev/null || echo "?"; else echo "-"; fi
}
tsv_get() { P="$1" awk -F'\t' '$1==ENVIRON["P"] {print $2; exit}' "$2"; }
bl_has() { # $1 path, $2 hash, $3 baseline file → recorded with this hash, or with "*"
  local b; b="$(tsv_get "$1" "$3")"; [ -n "$b" ] && { [ "$b" = "*" ] || [ "$b" = "$2" ]; }
}
list_changes() { # every change vs base, project-relative; .claude/specs/ excluded
  { git -C "$TOP" -c core.quotePath=false diff --name-only --no-renames "$BASE" --
    git -C "$TOP" -c core.quotePath=false ls-files --others --exclude-standard; } | grep -v '^$' | sort -u \
    | while IFS= read -r p || [ -n "$p" ]; do
        if [ -z "$PREFIX" ]; then printf '%s\n' "$p"
        else case "$p" in "$PREFIX"*) printf '%s\n' "${p#"$PREFIX"}" ;; *) printf '@repo/%s\n' "$p" ;; esac; fi
      done | grep -v '^\.claude/specs/'
}
bl_upsert() { # $1 baseline file, $2 path, $3 hash — caller holds the lock
  P="$2" awk -F'\t' '$1!=ENVIRON["P"]' "$1" >"$TMP/bl" && cat "$TMP/bl" >"$1"; printf '%s\t%s\n' "$2" "$3" >>"$1"
}
has_line() { grep -qxF -- "$1" "$2"; }
in_allow() { # $1 path, $2 cleaned allowlist
  has_line "$1" "$2" && return 0
  local a; while IFS= read -r a || [ -n "$a" ]; do case "$a" in */) case "$1" in "$a"*) return 0 ;; esac ;; esac; done <"$2"
  return 1
}

DOC_RE='\.(md|mdx|markdown|txt|rst|adoc|png|jpe?g|gif|svg|webp|ico|pdf)$'
CODE_RE='\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|vue|svelte|astro|py|go|rb|java|kt|kts|swift|rs|php|cs|scala|ex|exs|dart|c|cc|cpp|h|hpp|m|mm|lua|clj|erl|hs|fs|r|R|pl|groovy|sh|bash|zsh|ps1)$'
SCHEMA_RE='\.(sql|prisma|graphql|gql|proto|tf|tfvars|hcl)$'
# dependency manifests and lint/type/test tool configs — a check agent must never change these
GUARD_RE='(^|/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|yarn\.lock|package-lock\.json|bun\.lockb|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|uv\.lock|Pipfile(\.lock)?|go\.(mod|sum)|Cargo\.(toml|lock)|Gemfile(\.lock)?|composer\.(json|lock)|pom\.xml|(build|settings)\.gradle(\.kts)?|tsconfig[^/]*\.json|jsconfig\.json|\.eslintrc[^/]*|eslint\.config\.[^/]+|\.prettierrc[^/]*|prettier\.config\.[^/]+|biome\.jsonc?|(vite|vitest|jest|babel|playwright|webpack|rollup|next|nuxt|svelte|astro)\.config\.[^/]+|\.babelrc|pytest\.ini|mypy\.ini|\.mypy\.ini|setup\.cfg|tox\.ini|ruff\.toml|\.ruff\.toml|\.flake8|\.claude/specs/_gate\.cmds)$'

list_changes >"$TMP/all"

# ---------- baseline mode ----------
if [ -n "$WRITE_BL" ]; then
  n=0
  lock_bl "$WRITE_BL"
  if [ -n "$SINCE" ]; then
    clean_list "$ALLOW" >"$TMP/allow"; : >"$TMP/achg"; : >"$TMP/ucode"
    while IFS= read -r p || [ -n "$p" ]; do
      h="$(hash_of "$p")"
      if in_allow "$p" "$TMP/allow"; then   # never baselined; report edits made after the snapshot
        [ "$(tsv_get "$p" "$SINCE")" = "$h" ] || bl_has "$p" "$h" "$WRITE_BL" || printf '%s\n' "$p" >>"$TMP/achg"
        continue
      fi
      [ "$(tsv_get "$p" "$SINCE")" = "$h" ] && continue
      bl_has "$p" "$h" "$WRITE_BL" && continue
      if [ $INCLUDE_CODE = 0 ] && printf '%s\n' "$p" | grep -qE "$CODE_RE|$SCHEMA_RE|$GUARD_RE"; then printf '%s\n' "$p" >>"$TMP/ucode"; continue; fi
      bl_upsert "$WRITE_BL" "$p" "$h"; n=$((n + 1))
    done <"$TMP/all"
    cut -f1 "$SINCE" | while IFS= read -r p || [ -n "$p" ]; do
      in_allow "$p" "$TMP/allow" && ! has_line "$p" "$TMP/all" && printf '%s (reverted to base)\n' "$p"
    done >>"$TMP/achg"
    [ -s "$TMP/achg" ] && { echo "allowlisted-changed: $(wc -l <"$TMP/achg" | tr -d ' ') feature file(s) edited since the snapshot:"; sed -n '1,20p' "$TMP/achg" | sed 's/^/  /'; }
    [ -s "$TMP/ucode" ] && { echo "unexpected-code: $(wc -l <"$TMP/ucode" | tr -d ' ') code/schema/manifest/tool-config file(s) outside the allowlist changed since the snapshot (not baselined):"; sed -n '1,20p' "$TMP/ucode" | sed 's/^/  /'; }
  else
    while IFS= read -r p || [ -n "$p" ]; do printf '%s\t%s\n' "$p" "$(hash_of "$p")"; n=$((n + 1)); done <"$TMP/all" >"$WRITE_BL.tmp.$$" \
      && mv "$WRITE_BL.tmp.$$" "$WRITE_BL"
  fi
  unlock_bl
  echo "baseline: $n path(s) recorded as not-this-feature → $WRITE_BL"
  exit 0
fi

# ---------- validate the project override before running anything ----------
OVR="$PROJECT/.claude/specs/_gate.cmds"
if [ -f "$OVR" ]; then
  ln=0
  while IFS= read -r line || [ -n "$line" ]; do
    ln=$((ln + 1)); t="${line#"${line%%[![:space:]]*}"}"
    case "$t" in ""|"#"*) continue ;; esac
    nm="${t%%:*}"; cm="${t#*:}"
    case "$t" in *:*) ;; *) die "_gate.cmds line $ln is not 'name: command': $t" ;; esac
    [ -n "$(printf '%s' "$nm" | tr -d '[:space:]')" ] && [ -n "$(printf '%s' "$cm" | tr -d '[:space:]')" ] \
      || die "_gate.cmds line $ln is not 'name: command': $t"
  done <"$OVR"
fi

mkdir -p "$OUT" || die "cannot create $OUT"
rm -f "$OUT"/*.log "$OUT/summary.md" "$OUT/hashes.tsv" "$OUT/changed-since.txt" \
      "$OUT/files-touched-violations.txt" "$OUT/feature.diff" 2>/dev/null
SUMMARY="$OUT/summary.md"; : >"$SUMMARY"
FAILS=0 CHECKS=0 RAN_N=0
: >"$TMP/uncovered"; : >"$TMP/done"; : >"$TMP/covered"; : >"$TMP/e2e"

# ---------- this feature's changes (baseline-unchanged paths dropped) ----------
: >"$TMP/fc.tsv"; nbl=0
: >"$TMP/start.tsv"
while IFS= read -r p || [ -n "$p" ]; do
  h="$(hash_of "$p")"; printf '%s\t%s\n' "$p" "$h" >>"$TMP/start.tsv"
  if bl_has "$p" "$h" "$BASELINE"; then nbl=$((nbl + 1)); continue; fi
  printf '%s\t%s\n' "$p" "$h" >>"$TMP/fc.tsv"
done <"$TMP/all"
cut -f1 "$TMP/fc.tsv" >"$TMP/fc"
grep -v '^@repo/' "$TMP/fc" >"$TMP/in" || true
export GATE_CHANGED="$TMP/fc" GATE_FULL="$FULL"
clean_list "$ALLOW" >"$TMP/allow"

record_artifacts() { # files the checks created / rewrote are not this feature's (never allowlisted ones)
  ARTS_DONE=1; : >"$TMP/artifacts"
  lock_bl "$BASELINE"
  list_changes >"$TMP/after"
  while IFS= read -r p || [ -n "$p" ]; do
    in_allow "$p" "$TMP/allow" && continue
    h="$(hash_of "$p")"; st="$(tsv_get "$p" "$TMP/start.tsv")"
    if [ -z "$st" ]; then                                   # created during this run
      bl_upsert "$BASELINE" "$p" "*"; printf '%s\n' "$p" >>"$TMP/artifacts"
    elif [ "$st" != "$h" ] && bl_has "$p" "$st" "$BASELINE"; then   # not-this-feature file a check rewrote
      [ "$(tsv_get "$p" "$BASELINE")" = "*" ] || bl_upsert "$BASELINE" "$p" "$h"
      printf '%s\n' "$p" >>"$TMP/artifacts"
    fi
  done <"$TMP/after"
  unlock_bl
}
ARTS_READY=1

emit() { printf '%s\n' "$*" | tee -a "$SUMMARY"; }
uncovered() { printf '%s\n' "$1" >>"$TMP/uncovered"; emit "SKIP  $1"; }
covers() { local f; for f in "$@"; do printf '%s\n' "$f" >>"$TMP/covered"; done; }
capped() { # $1 file, $2 max lines — indented, with an overflow note
  sed -n "1,${2}p" "$1" | sed 's/^/      /' | tee -a "$SUMMARY"
  local n; n="$(wc -l <"$1" | tr -d ' ')"
  [ "$n" -gt "$2" ] && emit "      … and $((n - $2)) more"
  return 0
}
excerpt() { # failing lines first (no log line numbers), else the tail; max 40 lines
  grep -E '(^|[^a-z])(error|Error|ERROR|FAIL|FAILED|failed|✕|×|AssertionError|panic:|Traceback|SyntaxError|TS[0-9]{4})|File "[^"]+", line [0-9]+|:[0-9]+:[0-9]+|\([0-9]+,[0-9]+\)|^/[^ ]+\.[A-Za-z]+$|^[A-Za-z0-9_.@/-]+\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|go|rb|sh)$' "$1" >"$TMP/ex" || true
  [ -s "$TMP/ex" ] || tail -40 "$1" >"$TMP/ex"
  capped "$TMP/ex" 40
}

run_check() { # $1 name, $2 dir, $3 ok exit codes ("0" / "0 5"), rest = command
  # returns 0 PASS · 1 FAIL · 2 did not run (tool missing) — only 0/1 count as coverage
  local name="$1" dir="$2" okc="$3"; shift 3
  local slug log start rc secs pid wd rel eff cut=0 rem
  rem=$(( BUDGET - ($(date +%s) - GATE_START) )); eff=$TIMEOUT
  if [ $rem -le 5 ]; then uncovered "$name  (gate budget of ${BUDGET}s used up — re-run with a larger GATE_TOTAL_BUDGET in the background)"; return 2; fi
  [ $rem -lt $TIMEOUT ] && { eff=$rem; cut=1; }
  slug="$(printf '%s' "$name" | tr -c 'A-Za-z0-9-' '_' | sed 's/__*/_/g; s/_$//')"
  log="$OUT/$slug.log"; rel="${dir#"$PROJECT"}"; rel="${rel#/}"
  start="$(date +%s)"; rm -f "$TMP/timedout"
  printf '$ (cd %s && %s)\n\n' "${rel:-.}" "$*" >"$log"
  # never let a check install or change dependencies (pnpm ≥10 can install before `run`)
  ( cd "$dir" && exec env CI=true FORCE_COLOR=0 NO_COLOR=1 \
      npm_config_verify_deps_before_run=false pnpm_config_verify_deps_before_run=false \
      "$@" ) >>"$log" 2>&1 </dev/null &
  pid=$!; CUR_PID=$pid
  ( sleep "$eff"; : >"$TMP/timedout"; kill -TERM -- -"$pid" 2>/dev/null; sleep 5; kill -KILL -- -"$pid" 2>/dev/null ) >/dev/null 2>&1 &
  wd=$!; CUR_WD=$wd
  wait "$pid" 2>/dev/null; rc=$?; CUR_PID=""
  kill -TERM -- -"$wd" 2>/dev/null; wait "$wd" 2>/dev/null; CUR_WD=""
  secs=$(( $(date +%s) - start ))
  if [ -f "$TMP/timedout" ] && [ $cut = 1 ]; then
    uncovered "$name  (cut off by the gate budget of ${BUDGET}s — re-run with a larger GATE_TOTAL_BUDGET in the background; log: $log)"; return 2
  fi
  if [ ! -f "$TMP/timedout" ]; then
    case " $okc " in *" ${rc}~ "*) CHECKS=$((CHECKS + 1)); emit "PASS  $name  (${secs}s; nothing collected — not counted as coverage)"; return 0 ;; esac
    case " $okc " in *" $rc "*) CHECKS=$((CHECKS + 1)); RAN_N=$((RAN_N + 1)); emit "PASS  $name  (${secs}s)"; return 0 ;; esac
    if [ $rc -eq 127 ] || tail -5 "$log" | grep -qE 'command not found|: not found$|not recognized as an internal|ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL.*not found|Command ".*" not found'; then
      uncovered "$name  (tool not found — install dependencies; log: $log)"; return 2
    fi
  fi
  CHECKS=$((CHECKS + 1)); FAILS=$((FAILS + 1)); RAN_N=$((RAN_N + 1))
  if [ -f "$TMP/timedout" ]; then emit "FAIL  $name (timeout)  (no result after ${TIMEOUT}s, full log: $log)"
  else emit "FAIL  $name  (exit $rc, ${secs}s, paths relative to ${rel:-.}, full log: $log)"; fi
  excerpt "$log"
  return 1
}
ran() { [ "$1" -le 1 ]; }   # run_check status → did the check examine the code?

find_up() { # $1 start dir; rest = names. First dir up to PROJECT containing any of them.
  local d="$1" f; shift
  while :; do
    for f in "$@"; do [ -e "$d/$f" ] && { printf '%s\n' "$d"; return 0; }; done
    [ "$d" = "$PROJECT" ] || [ "$d" = "/" ] && return 1
    d="$(dirname "$d")"
  done
}
local_bin() { local d; d="$(find_up "$1" "node_modules/.bin/$2")" || return 1; printf '%s\n' "$d/node_modules/.bin/$2"; }
scripts_tsv() { # package.json → "name<TAB>command" lines
  command -v node >/dev/null 2>&1 || return 0
  node -e 'try{const s=require(process.argv[1]).scripts||{};for(const k in s)console.log(k+"\t"+String(s[k]).replace(/\s+/g," "))}catch(e){}' "$1"
}
script_named() { # $1 tsv, rest = candidates → first real script (npm's placeholder test ignored)
  local tsv="$1" s v; shift
  for s in "$@"; do
    v="$(awk -F'\t' -v k="$s" '$1==k {print $2; exit}' "$tsv")"
    [ -n "$v" ] || continue
    case "$v" in *"no test specified"*) continue ;; esac
    printf '%s\n' "$s"; return 0
  done
  return 1
}
pm_of() {
  local d; d="$(find_up "$1" pnpm-lock.yaml yarn.lock bun.lockb package-lock.json)" || { echo npm; return; }
  if [ -f "$d/pnpm-lock.yaml" ]; then echo pnpm; elif [ -f "$d/yarn.lock" ]; then echo yarn
  elif [ -f "$d/bun.lockb" ]; then echo bun; else echo npm; fi
}
pm_ok() { command -v "$1" >/dev/null 2>&1; }
runner_of() { # $1 pkg dir → "vitest <bin>" | "jest <bin>" | ""
  local b
  if grep -q '"vitest"' "$1/package.json" 2>/dev/null && b="$(local_bin "$1" vitest)"; then echo "vitest $b"; return; fi
  if grep -q '"jest"' "$1/package.json" 2>/dev/null && b="$(local_bin "$1" jest)"; then echo "jest $b"; return; fi
  if b="$(local_bin "$1" vitest)"; then echo "vitest $b"; return; fi
  if b="$(local_bin "$1" jest)"; then echo "jest $b"; return; fi
}
relto() { printf '%s' "${2#"$1"/}"; }
is_test() { case "$1" in *.test.*|*.spec.*|*/__tests__/*|*_test.go|*/test_*.py|test_*.py|*_test.py) return 0 ;; esac; return 1; }
is_e2e() { # Playwright / e2e specs are feature-qa's, never unit-runner input
  case "$1" in e2e/*|*/e2e/*|playwright/*|*/playwright/*) return 0 ;; esac
  [ -f "$PROJECT/$1" ] && grep -q '@playwright/test' "$PROJECT/$1" 2>/dev/null
}

# ---------- header ----------
mig=no deps=no ui=no api=no
grep -qE '(^|/)(migrations?|migrate|drizzle|alembic|supabase/migrations|prisma/migrations)/|(^|/)prisma/schema\.prisma$' "$TMP/fc" && mig=yes
grep -qE '(^|/)(package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|bun\.lockb|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|uv\.lock|go\.(mod|sum)|Cargo\.(toml|lock)|Gemfile(\.lock)?|composer\.(json|lock)|pom\.xml|build\.gradle(\.kts)?)$' "$TMP/fc" && deps=yes
grep -qE '\.(tsx|jsx|vue|svelte|astro|css|scss|html)$|(^|/)(app|pages|screens|components|views)/.*\.(ts|js|mjs)$' "$TMP/fc" && ui=yes
grep -qE '\.(controller|dto|resolver)\.[jt]s$|(^|/)(routes?|routers?|api|handlers?|endpoints|controllers)/|(^|/)(server|main|app)\.(ts|js|py|go)$' "$TMP/fc" && api=yes
emit "# gate — base $(git -C "$PROJECT" rev-parse --short "$BASE") · $(wc -l <"$TMP/fc" | tr -d ' ') changed file(s) · ${nbl} baselined · $([ $FULL = 1 ] && echo full || echo related) · $(date -u +%Y-%m-%dT%H:%M:%SZ)"
emit "touched: migrations=$mig deps=$deps ui=$ui api=$api · review diff: $OUT/feature.diff"

if [ -n "$SINCE" ]; then
  { while IFS="$TAB" read -r p h || [ -n "$p" ]; do [ "$(tsv_get "$p" "$SINCE")" = "$h" ] || printf '%s\n' "$p"; done <"$TMP/fc.tsv"
    cut -f1 "$SINCE" | while IFS= read -r p || [ -n "$p" ]; do has_line "$p" "$TMP/fc" || printf '%s\n' "$p"; done
  } | sort -u >"$OUT/changed-since.txt"
  emit "changed-since: $(wc -l <"$OUT/changed-since.txt" | tr -d ' ') file(s) → $OUT/changed-since.txt"
fi

# ---------- allowlist (BLOCK-class) ----------
: >"$TMP/viol"
while IFS= read -r f || [ -n "$f" ]; do in_allow "$f" "$TMP/allow" || printf '%s\n' "$f" >>"$TMP/viol"; done <"$TMP/fc"
CHECKS=$((CHECKS + 1))
if [ -s "$TMP/viol" ]; then
  FAILS=$((FAILS + 1)); cp "$TMP/viol" "$OUT/files-touched-violations.txt"
  emit "FAIL  files-touched  ($(wc -l <"$TMP/viol" | tr -d ' ') path(s) outside the allowlist → $OUT/files-touched-violations.txt)"
  capped "$TMP/viol" 30
else
  emit "PASS  files-touched"
fi

# ---------- regression list (missing files are BLOCK-class) ----------
: >"$TMP/also"; : >"$TMP/also-missing"; : >"$TMP/also-out"
if [ -n "$ALSO" ]; then
  clean_list "$ALSO" >"$TMP/also-raw" || true
  while IFS= read -r t || [ -n "$t" ]; do
    case "$t" in
      @repo/*) if [ -f "$TOP/${t#@repo/}" ]; then printf '%s\n' "$t" >>"$TMP/also-out"; else printf '%s\n' "$t" >>"$TMP/also-missing"; fi ;;
      *) if [ -f "$PROJECT/$t" ]; then printf '%s\n' "$t" >>"$TMP/also"; else printf '%s\n' "$t" >>"$TMP/also-missing"; fi ;;
    esac
  done <"$TMP/also-raw"
  if [ -s "$TMP/also-missing" ]; then
    CHECKS=$((CHECKS + 1)); FAILS=$((FAILS + 1))
    emit "FAIL  regression-missing  (related-feature test file(s) no longer exist)"
    capped "$TMP/also-missing" 30
  fi
fi

if [ -f "$OVR" ]; then
  # ---------- project override ----------
  emit "mode: project override (.claude/specs/_gate.cmds)"
  reg_seen=no ran_any=no
  while IFS= read -r line || [ -n "$line" ]; do
    t="${line#"${line%%[![:space:]]*}"}"
    case "$t" in ""|"#"*) continue ;; esac
    name="$(printf '%s' "${t%%:*}" | sed 's/[[:space:]]*$//')"
    cmd="$(printf '%s' "${t#*:}" | sed 's/^[[:space:]]*//')"
    if [ "$name" = regression ]; then
      reg_seen=yes; [ -s "$TMP/also" ] || continue
      args=(); while IFS= read -r a || [ -n "$a" ]; do args+=("$a"); done <"$TMP/also"
      run_check "regression (override)" "$PROJECT" "0" bash -c "$cmd \"\$@\"" gate "${args[@]}"
    else
      run_check "$name" "$PROJECT" "0" bash -c "$cmd"; ran $? && ran_any=yes
    fi
  done <"$OVR"
  [ -s "$TMP/also" ] && [ $reg_seen = no ] && uncovered "regression  (tests listed in --also-tests but _gate.cmds has no 'regression:' line)"
  [ $ran_any = yes ] && cat "$TMP/in" >>"$TMP/covered"
  [ $ran_any = no ] && grep -qvE "$DOC_RE" "$TMP/fc" && uncovered "override  (no _gate.cmds line ran for this feature's changes)"
else
  # ---------- JS / TS ----------
  grep -E '\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|vue|svelte|astro)$' "$TMP/in" >"$TMP/js" || true
  grep -E '\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$' "$TMP/also" >"$TMP/jsalso" || true
  : >"$TMP/roots"
  while IFS= read -r f || [ -n "$f" ]; do
    if is_e2e "$f"; then printf '%s\n' "$f" >>"$TMP/e2e"; fi
    r="$(find_up "$(dirname "$PROJECT/$f")" package.json)" && printf '%s\t%s\tsrc\n' "$r" "$f" >>"$TMP/roots" \
      || uncovered "js  ($f is not under any package.json)"
  done <"$TMP/js"
  while IFS= read -r f || [ -n "$f" ]; do
    r="$(find_up "$(dirname "$PROJECT/$f")" package.json)" && printf '%s\t%s\treg\n' "$r" "$f" >>"$TMP/roots" \
      || uncovered "regression  ($f is not under any package.json)"
  done <"$TMP/jsalso"
  # non-code changes (manifests, lockfiles, tsconfig, data, schema) re-check their package with full tests
  grep -vE '\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|vue|svelte|astro)$' "$TMP/in" | grep -vE "$CODE_RE" | grep -vE "$DOC_RE" >"$TMP/jscfg" || true
  while IFS= read -r f || [ -n "$f" ]; do
    r="$(find_up "$(dirname "$PROJECT/$f")" package.json)" && printf '%s\t%s\tcfg\n' "$r" "$f" >>"$TMP/roots"
  done <"$TMP/jscfg"
  MONO=no
  { [ -f pnpm-workspace.yaml ] || [ -f lerna.json ] || [ -f nx.json ] || [ -f turbo.json ] \
    || grep -q '"workspaces"' package.json 2>/dev/null; } && MONO=yes
  : >"$TMP/pkgjsons"
  if [ $MONO = yes ]; then
    git -C "$PROJECT" -c core.quotePath=false ls-files -- 'package.json' '*/package.json' | grep -v node_modules \
      | sed "s|^|$PROJECT/|" >"$TMP/pkgjsons"
    # a root manifest / lockfile / shared config change affects every workspace package
    if grep -qE '^(package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|bun\.lockb|pnpm-workspace\.yaml|tsconfig[^/]*\.json|turbo\.json|nx\.json)$' "$TMP/jscfg"; then
      while IFS= read -r pj || [ -n "$pj" ]; do printf '%s\t(workspace manifest)\tcfg\n' "$(dirname "$pj")" >>"$TMP/roots"; done <"$TMP/pkgjsons"
    fi
  fi
  cut -f1 "$TMP/roots" | sort -u >"$TMP/rootlist"

  if [ -s "$TMP/rootlist" ] && ! command -v node >/dev/null 2>&1; then
    while IFS= read -r r; do uncovered "js $(relto "$PROJECT" "$r")  (node not found)"; done <"$TMP/rootlist"
    : >"$TMP/rootlist"
  fi
  : >"$TMP/deps"
  if [ -s "$TMP/rootlist" ]; then
    scripts_tsv "$PROJECT/package.json" >"$TMP/rootscripts" 2>/dev/null || : >"$TMP/rootscripts"
    ROOTPM="$(pm_of "$PROJECT")"
    if [ $MONO = yes ]; then  # dependents of changed packages (transitive) re-check their consumers
      cat >"$TMP/deps.js" <<'JS'
const fs=require('fs'),path=require('path');
const [,,list,changedFile]=process.argv;
const pkgs=fs.readFileSync(list,'utf8').split('\n').filter(Boolean).map(p=>{try{const j=JSON.parse(fs.readFileSync(p,'utf8'));return{dir:path.dirname(p),name:j.name,deps:Object.keys(Object.assign({},j.dependencies,j.devDependencies,j.peerDependencies,j.optionalDependencies))}}catch(e){return null}}).filter(Boolean);
const changed=new Set(fs.readFileSync(changedFile,'utf8').split('\n').filter(Boolean));
const hit=new Set(changed);let grew=true;
while(grew){grew=false;const names=new Set(pkgs.filter(p=>hit.has(p.dir)&&p.name).map(p=>p.name));
for(const p of pkgs){if(hit.has(p.dir))continue;if(p.deps.some(n=>names.has(n))){hit.add(p.dir);grew=true}}}
for(const d of hit)if(!changed.has(d))console.log(d);
JS
      node "$TMP/deps.js" "$TMP/pkgjsons" "$TMP/rootlist" >"$TMP/deps" 2>/dev/null || : >"$TMP/deps"
      [ -s "$TMP/deps" ] && emit "dependents: $(while IFS= read -r d; do printf '%s ' "$(relto "$PROJECT" "$d")"; done <"$TMP/deps")"
    fi

    WS_TC=no
    if [ $MONO = yes ] && tc="$(script_named "$TMP/rootscripts" typecheck type-check check-types tsc)"; then
      if [ ! -d "$PROJECT/node_modules" ]; then uncovered "typecheck (workspace)  (node_modules missing — install dependencies)"
      elif pm_ok "$ROOTPM"; then
        run_check "typecheck (workspace)" "$PROJECT" "0" "$ROOTPM" run "$tc"
        ran $? && { WS_TC=yes; cat "$TMP/js" >>"$TMP/covered"; }
      else uncovered "typecheck (workspace)  ($ROOTPM not installed)"; fi
    fi
    cat "$TMP/rootlist" "$TMP/deps" >"$TMP/affected"
    while IFS= read -r r || [ -n "$r" ]; do
      rel="$(relto "$PROJECT" "$r")"; [ "$r" = "$PROJECT" ] && rel="."
      dependent=no; has_line "$r" "$TMP/deps" && dependent=yes
      if ! find_up "$r" node_modules >/dev/null; then
        uncovered "js $rel  (node_modules missing — install dependencies)"; continue
      fi
      pm="$(pm_of "$r")"; scripts_tsv "$r/package.json" >"$TMP/scripts"
      src=(); tests=(); regs=(); srcabs=(); mine=(); cfgn=0; before=$RAN_N
      while IFS="$TAB" read -r rr f kind || [ -n "$rr" ]; do
        if [ "$kind" = src ] && [ -f "$PROJECT/$f" ] && ! is_test "$f"; then srcabs+=("$PROJECT/$f"); fi
        [ "$rr" = "$r" ] || continue
        if [ "$kind" = reg ]; then regs+=("$(relto "$r" "$PROJECT/$f")"); continue; fi
        if [ "$kind" = cfg ]; then cfgn=$((cfgn + 1)); continue; fi
        mine+=("$f")
        [ -f "$PROJECT/$f" ] || continue
        if has_line "$f" "$TMP/e2e"; then continue
        elif is_test "$f"; then tests+=("$(relto "$r" "$PROJECT/$f")")
        else src+=("$PROJECT/$f"); fi
      done <"$TMP/roots"

      if [ $WS_TC = no ]; then
        st=9
        if tc="$(script_named "$TMP/scripts" typecheck type-check check-types tsc)"; then
          if pm_ok "$pm"; then run_check "typecheck $rel" "$r" "0" "$pm" run "$tc"; st=$?; else uncovered "typecheck $rel  ($pm not installed)"; fi
        elif [ -f "$r/tsconfig.json" ] && tsc="$(local_bin "$r" tsc)"; then
          if grep -q '"references"' "$r/tsconfig.json"; then run_check "typecheck $rel" "$r" "0" "$tsc" -b; st=$?
          else run_check "typecheck $rel" "$r" "0" "$tsc" --noEmit -p tsconfig.json; st=$?; fi
        else emit "SKIP  typecheck $rel  (no typecheck script or tsconfig + local tsc)"; fi
        [ $dependent = no ] && [ $st -le 1 ] && [ ${#mine[@]} -gt 0 ] && covers "${mine[@]}"
      fi

      if [ $dependent = no ]; then
        st=9
        if [ ${#src[@]} -gt 0 ] && eslint="$(local_bin "$r" eslint)" \
           && find_up "$r" eslint.config.js eslint.config.mjs eslint.config.cjs eslint.config.ts .eslintrc .eslintrc.js .eslintrc.cjs .eslintrc.json .eslintrc.yml .eslintrc.yaml >/dev/null; then
          run_check "lint $rel" "$r" "0" "$eslint" "${src[@]}"; st=$?
        elif ls=$(script_named "$TMP/scripts" lint) && pm_ok "$pm"; then
          run_check "lint $rel" "$r" "0" "$pm" run "$ls"; st=$?
        elif [ $MONO = yes ] && ls=$(script_named "$TMP/rootscripts" lint) && pm_ok "$ROOTPM"; then
          if has_line lint-ws "$TMP/done"; then st=0; RAN_N=$((RAN_N + 1))
          else echo lint-ws >>"$TMP/done"; run_check "lint (workspace)" "$PROJECT" "0" "$ROOTPM" run "$ls"; st=$?; fi
        else emit "SKIP  lint $rel  (no eslint+config or lint script)"; fi
        [ $st -le 1 ] && [ ${#mine[@]} -gt 0 ] && covers "${mine[@]}"
      fi

      runner="$(runner_of "$r")"; rkind="${runner%% *}"; rbin="${runner#* }"
      if [ $FULL = 1 ] || [ $cfgn -gt 0 ]; then   # config/data/manifest changes → the package's full suite
        if [ $MONO = yes ] && t="$(script_named "$TMP/rootscripts" test)"; then
          if ! has_line test-ws "$TMP/done"; then
            echo test-ws >>"$TMP/done"
            if pm_ok "$ROOTPM"; then run_check "tests(full) workspace" "$PROJECT" "0" "$ROOTPM" run "$t"; else uncovered "tests(full) workspace  ($ROOTPM not installed)"; fi
          else RAN_N=$((RAN_N + 1)); fi
        elif t="$(script_named "$TMP/scripts" test)" && pm_ok "$pm"; then run_check "tests(full) $rel" "$r" "0" "$pm" run "$t"
        elif [ "$rkind" = vitest ]; then run_check "tests(full) $rel" "$r" "0" "$rbin" run --passWithNoTests
        elif [ "$rkind" = jest ]; then run_check "tests(full) $rel" "$r" "0" "$rbin" --ci --passWithNoTests
        else emit "SKIP  tests $rel  (no test script or vitest/jest)"; fi
      else
        rel_src=("${src[@]}"); [ $dependent = yes ] && rel_src=("${srcabs[@]}")
        if [ "$rkind" = vitest ]; then
          [ ${#rel_src[@]} -gt 0 ] && run_check "tests(related) $rel" "$r" "0" "$rbin" related --run --passWithNoTests "${rel_src[@]}"
          [ ${#tests[@]} -gt 0 ] && run_check "tests(direct) $rel" "$r" "0" "$rbin" run --passWithNoTests "${tests[@]}"
        elif [ "$rkind" = jest ]; then
          [ ${#rel_src[@]} -gt 0 ] && run_check "tests(related) $rel" "$r" "0" "$rbin" --ci --findRelatedTests --passWithNoTests "${rel_src[@]}"
          [ ${#tests[@]} -gt 0 ] && run_check "tests(direct) $rel" "$r" "0" "$rbin" --ci --passWithNoTests --runTestsByPath "${tests[@]}"
        elif t="$(script_named "$TMP/scripts" test)" && pm_ok "$pm"; then run_check "tests(full) $rel" "$r" "0" "$pm" run "$t"
        else emit "SKIP  tests $rel  (no vitest/jest or test script)"; fi
      fi
      if [ ${#regs[@]} -gt 0 ]; then
        if [ "$rkind" = vitest ]; then run_check "regression $rel" "$r" "0" "$rbin" run "${regs[@]}"
        elif [ "$rkind" = jest ]; then run_check "regression $rel" "$r" "0" "$rbin" --ci --runTestsByPath "${regs[@]}"
        else uncovered "regression $rel  (no vitest/jest to run ${#regs[@]} related-feature test file(s))"; fi
      fi
      if [ $RAN_N -eq $before ] && [ $dependent = no ] && [ $WS_TC = no ]; then
        uncovered "js $rel  (its changes triggered no check that could run)"
      fi
    done <"$TMP/affected"
  fi
  [ -s "$TMP/e2e" ] && emit "e2e: $(wc -l <"$TMP/e2e" | tr -d ' ') Playwright/e2e spec(s) not run here — feature-qa runs them"

  # ---------- Python ----------
  grep -E '\.py$' "$TMP/in" >"$TMP/py" || true
  grep -E '\.py$' "$TMP/also" >"$TMP/pyalso" || true
  grep -E '(^|/)(pyproject\.toml|setup\.cfg|setup\.py|requirements[^/]*\.txt|poetry\.lock|uv\.lock|Pipfile(\.lock)?|tox\.ini|pytest\.ini|mypy\.ini|\.python-version)$' "$TMP/in" >"$TMP/pycfg" || true
  cat "$TMP/py" "$TMP/pyalso" "$TMP/pycfg" | while IFS= read -r f || [ -n "$f" ]; do
    find_up "$(dirname "$PROJECT/$f")" pyproject.toml setup.cfg setup.py requirements.txt || printf '%s\n' "$PROJECT"
  done | sort -u >"$TMP/pyroots"
  while IFS= read -r r || [ -n "$r" ]; do
    rel="$(relto "$PROJECT" "$r")"; [ "$r" = "$PROJECT" ] && rel="."; before=$RAN_N
    py=(); pyrel=(); while IFS= read -r f || [ -n "$f" ]; do
      [ -f "$PROJECT/$f" ] || continue
      case "$PROJECT/$f" in "$r"/*) py+=("$PROJECT/$f"); pyrel+=("$f") ;; esac
    done <"$TMP/py"
    regpy=(); while IFS= read -r f || [ -n "$f" ]; do case "$PROJECT/$f" in "$r"/*) regpy+=("$PROJECT/$f") ;; esac; done <"$TMP/pyalso"
    PYBIN=""; for p in "$r/.venv/bin" "$r/venv/bin" "$PROJECT/.venv/bin" "$PROJECT/venv/bin"; do [ -d "$p" ] && { PYBIN="$p/"; break; }; done
    pyexe="${PYBIN}python"; [ -x "$pyexe" ] || pyexe="python3"
    if [ ${#py[@]} -gt 0 ]; then
      req="$(grep -E '^[[:space:]]*requires-python' "$r/pyproject.toml" 2>/dev/null | head -1 | grep -oE '(>=|~=|==|>)[[:space:]]*3\.[0-9]+' | head -1 | grep -oE '3\.[0-9]+')"
      have="$("$pyexe" -c 'import sys;print("%d.%d"%sys.version_info[:2])' 2>/dev/null)"
      if [ -n "$req" ] && [ -n "$have" ] && [ "${have#3.}" -lt "${req#3.}" ] 2>/dev/null; then
        uncovered "syntax python $rel  ($pyexe is $have, project requires $req+ — create the project venv)"
      elif pm_ok "$pyexe" || [ -x "$pyexe" ]; then  # syntax: cheap, always available, writes no bytecode
        run_check "syntax python $rel" "$r" "0" "$pyexe" -c 'import ast,sys
for f in sys.argv[1:]: ast.parse(open(f,"rb").read(), f)' "${py[@]}"
        ran $? && covers "${pyrel[@]}"
      fi
      if [ -x "${PYBIN}ruff" ] || command -v ruff >/dev/null 2>&1; then
        ruff="${PYBIN}ruff"; [ -x "$ruff" ] || ruff=ruff; run_check "lint python $rel" "$r" "0" "$ruff" check "${py[@]}"
      elif "$pyexe" -m flake8 --version >/dev/null 2>&1; then run_check "lint python $rel" "$r" "0" "$pyexe" -m flake8 "${py[@]}"
      else emit "SKIP  lint python $rel  (no ruff or flake8)"; fi
      if { [ -f "$r/mypy.ini" ] || [ -f "$r/.mypy.ini" ] || grep -qs '^\[tool\.mypy\]' "$r/pyproject.toml" || grep -qs '^\[mypy' "$r/setup.cfg"; } \
         && "$pyexe" -m mypy --version >/dev/null 2>&1; then
        if [ $FULL = 1 ]; then run_check "types python $rel" "$r" "0" "$pyexe" -m mypy .
        else run_check "types python $rel" "$r" "0" "$pyexe" -m mypy "${py[@]}"; fi
      fi
    fi
    if "$pyexe" -c 'import pytest' >/dev/null 2>&1; then
      export PYTHONDONTWRITEBYTECODE=1
      run_check "tests(full) python $rel" "$r" "0 5~" "$pyexe" -m pytest -q -x -p no:cacheprovider   # 5 = none collected
      [ ${#regpy[@]} -gt 0 ] && run_check "regression python $rel" "$r" "0" "$pyexe" -m pytest -q -p no:cacheprovider "${regpy[@]}"
    else
      emit "SKIP  tests python $rel  (pytest not importable)"
      [ ${#regpy[@]} -gt 0 ] && uncovered "regression python $rel  (pytest not importable)"
    fi
    [ $RAN_N -eq $before ] && uncovered "python $rel  (its changes triggered no check that could run)"
  done <"$TMP/pyroots"

  # ---------- Go ----------
  : >"$TMP/gomods"; : >"$TMP/gonomod"
  cat "$TMP/in" "$TMP/also" | grep -E '\.go$|(^|/)go\.(mod|sum)$' | while IFS= read -r f || [ -n "$f" ]; do
    m="$(find_up "$(dirname "$PROJECT/$f")" go.mod)" && printf '%s\t%s\n' "$m" "$f" || printf '%s\n' "$f" >>"$TMP/gonomod"
  done >"$TMP/gofiles"
  while IFS= read -r f || [ -n "$f" ]; do uncovered "go  ($f has no go.mod between it and the project root)"; done <"$TMP/gonomod"
  cut -f1 "$TMP/gofiles" | sort -u >"$TMP/gomods"
  while IFS= read -r m || [ -n "$m" ]; do
    [ -n "$m" ] || continue
    rel="$(relto "$PROJECT" "$m")"; [ "$m" = "$PROJECT" ] && rel="."
    if command -v go >/dev/null 2>&1; then
      run_check "vet go $rel" "$m" "0" go vet ./...; s1=$?
      run_check "build go $rel" "$m" "0" go build ./...; s2=$?
      if ran $s1 || ran $s2; then M="$m" awk -F'\t' '$1==ENVIRON["M"] {print $2}' "$TMP/gofiles" >>"$TMP/covered"; fi
      run_check "tests go $rel" "$m" "0" go test ./...
    else uncovered "go $rel  (go toolchain not found)"; fi
  done <"$TMP/gomods"

  # ---------- shell ----------
  grep -E '\.(sh|bash)$' "$TMP/in" | while IFS= read -r f || [ -n "$f" ]; do [ -f "$PROJECT/$f" ] && printf '%s\n' "$f"; done >"$TMP/sh" || true
  if [ -s "$TMP/sh" ]; then
    shf=(); while IFS= read -r f || [ -n "$f" ]; do shf+=("$f"); done <"$TMP/sh"
    run_check "syntax shell" "$PROJECT" "0" bash -c 'for f; do bash -n "$f" || exit 1; done' gate "${shf[@]}"
    ran $? && cat "$TMP/sh" >>"$TMP/covered"
  fi

  grep -E '(^|/)(Cargo\.(toml|lock)|Gemfile(\.lock)?|composer\.(json|lock)|pom\.xml|(build|settings)\.gradle(\.kts)?|[^/]+\.csproj|mix\.(exs|lock)|pubspec\.(yaml|lock)|Package\.swift)$' "$TMP/in" \
    | while IFS= read -r f || [ -n "$f" ]; do uncovered "manifest  ($f: stack with no auto-detection — add .claude/specs/_gate.cmds)"; done
  if [ $RAN_N -eq 0 ] && grep -qvE "$DOC_RE" "$TMP/fc"; then
    uncovered "feature  (its changes triggered no check that could run)"
  fi
  grep -vE '\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|py|go)$' "$TMP/also" | while IFS= read -r t || [ -n "$t" ]; do
    uncovered "regression  ($t: no runner for this file type — add a 'regression:' line to .claude/specs/_gate.cmds)"
  done
fi

# ---------- coverage: every changed code file examined by a static check ----------
sort -u "$TMP/covered" >"$TMP/cov"
grep -E "$CODE_RE" "$TMP/in" | while IFS= read -r f || [ -n "$f" ]; do
  [ -f "$PROJECT/$f" ] || continue                 # deleted files: nothing to examine
  has_line "$f" "$TMP/e2e" 2>/dev/null && continue # feature-qa's
  has_line "$f" "$TMP/cov" || printf '%s\n' "$f"
done >"$TMP/uncov-code"
if [ -s "$TMP/uncov-code" ]; then
  sed 's/.*\.//' "$TMP/uncov-code" | sort | uniq -c | while read -r n ext; do
    uncovered "$ext  ($n changed .$ext file(s) no static check examined — add .claude/specs/_gate.cmds or the missing tool)"
  done
  capped "$TMP/uncov-code" 10
fi
grep '^@repo/' "$TMP/fc" | grep -E "$CODE_RE" | while IFS= read -r f || [ -n "$f" ]; do
  uncovered "outside  ($f is code outside the project dir; no check runs there — start the loop from the repo root)"
done
while IFS= read -r t || [ -n "$t" ]; do uncovered "regression  ($t is outside the project dir; no runner — add a 'regression:' line to _gate.cmds)"; done <"$TMP/also-out"
[ -s "$TMP/fc" ] || uncovered "feature  (no change attributable to this feature — $nbl change(s) are all baselined)"
grep -E "$SCHEMA_RE" "$TMP/in" >"$TMP/schema" || true
[ -s "$TMP/schema" ] && emit "unchecked: $(wc -l <"$TMP/schema" | tr -d ' ') schema/infra file(s) ($(sed 's/.*\.//' "$TMP/schema" | sort -u | tr '\n' ' ')) — Phase B (migration-safety / review) covers them"

# ---------- files the checks themselves created are not this feature's ----------
record_artifacts
# end-of-run snapshot: hashes after any fixes the checks applied; the diff reviewers read
{ cat "$TMP/fc"; while IFS= read -r p || [ -n "$p" ]; do in_allow "$p" "$TMP/allow" && printf '%s\n' "$p"; done <"$TMP/after"; } | sort -u >"$TMP/fc-end"
while IFS= read -r p || [ -n "$p" ]; do printf '%s\t%s\n' "$p" "$(hash_of "$p")"; done <"$TMP/fc-end" >"$OUT/hashes.tsv"
while IFS= read -r p || [ -n "$p" ]; do
  tp="$(top_path "$p")"
  if git -C "$TOP" cat-file -e "$BASE:$tp" 2>/dev/null; then
    git -C "$TOP" -c core.quotePath=false diff "$BASE" -- "$tp"
  else
    git -C "$TOP" -c core.quotePath=false diff --no-index -- /dev/null "$tp"
  fi
done <"$TMP/fc-end" >"$OUT/feature.diff" 2>/dev/null
if [ -s "$TMP/artifacts" ]; then
  emit "gate-artifacts: $(wc -l <"$TMP/artifacts" | tr -d ' ') path(s) created or rewritten by the checks → baselined (consider .gitignore)"
  capped "$TMP/artifacts" 5
fi

# ---------- verdict ----------
if [ "$FAILS" -gt 0 ]; then
  emit "GATE: FAIL ($FAILS of $CHECKS checks failed) — summary: $SUMMARY"; exit 1
fi
if [ -s "$TMP/uncovered" ]; then
  emit "GATE: INCOMPLETE ($(wc -l <"$TMP/uncovered" | tr -d ' ') uncovered; $CHECKS checks passed) — skip is not pass — summary: $SUMMARY"; exit 3
fi
emit "GATE: PASS ($CHECKS checks) — summary: $SUMMARY"
exit 0
