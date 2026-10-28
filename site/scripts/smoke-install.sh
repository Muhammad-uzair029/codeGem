#!/usr/bin/env bash
# Smoke test for dist/install.sh.
# Serves a copy of dist/ on localhost with python3, bakes that URL into the
# installer (as a real deploy would via SITE_URL), and runs it the way users
# do: curl -fsSL <url>/install.sh | bash -s -- <args>
#
#   npm run build && npm run test:install
set -euo pipefail

SITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_SRC="$SITE_DIR/../.claude/skills"
DIST="$SITE_DIR/dist"
# Run the installer with the system bash (3.2 on stock macOS) unless told otherwise.
INSTALL_BASH="${INSTALL_BASH:-/bin/bash}"

if [ ! -f "$DIST/manifest.json" ]; then
  echo "dist/ not found; running npm run build first"
  (cd "$SITE_DIR" && npm run build >/dev/null)
fi
command -v python3 >/dev/null || { echo "python3 is required"; exit 1; }

WORK="$(mktemp -d)"
SERVER_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
URL="http://127.0.0.1:$PORT"
SERVE="$WORK/serve"
cp -R "$DIST" "$SERVE"
# Re-render the installers with this URL baked in, exactly like a build with SITE_URL set.
(cd "$SITE_DIR" && SITE_URL="$URL" node --input-type=module -e "
  import { writeInstallers } from './lib/emit.mjs';
  import { resolveSiteUrl } from './lib/skills.mjs';
  writeInstallers(process.argv[1], resolveSiteUrl().url);
" "$SERVE")

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$SERVE" >"$WORK/server.log" 2>&1 &
SERVER_PID=$!
disown "$SERVER_PID" 2>/dev/null || true
for _ in $(seq 1 50); do
  curl -fsS "$URL/manifest.json" >/dev/null 2>&1 && break
  sleep 0.1
done
curl -fsS "$URL/manifest.json" >/dev/null || { echo "server did not start"; cat "$WORK/server.log"; exit 1; }

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $*"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL $*"; }
check() { local msg="$1"; shift; if "$@"; then ok "$msg"; else bad "$msg"; fi; }

# install <project dir> <args...>  -> output in $OUT, exit code in $RC
install() {
  local dir="$1"; shift
  mkdir -p "$dir"
  set +e
  OUT="$(cd "$dir" && curl -fsSL "$URL/install.sh" | "$INSTALL_BASH" -s -- "$@" 2>&1)"
  RC=$?
  set -e
}

manifest() { node -e "const m=require(process.argv[1]); $1" "$SERVE/manifest.json"; }
TOTAL="$(manifest 'console.log(m.skills.length)')"
FL_DEPS="$(manifest 'console.log(m.skills.find(s=>s.name==="feature-loop").allDeps.join(" "))')"
FL_FILES="$(manifest 'console.log(m.skills.find(s=>s.name==="feature-loop").files.length)')"
count_dirs() { find "$1" -mindepth 1 -maxdepth 1 -type d ! -name '.backup' | wc -l | tr -d ' '; }

echo "Serving $URL ($TOTAL skills); installer runs under $("$INSTALL_BASH" -c 'echo bash $BASH_VERSION')"

echo "1. single skill + transitive deps"
P="$WORK/p1"
install "$P" feature-loop
check "exit 0" [ "$RC" -eq 0 ]
check "feature-loop installed" [ -f "$P/.claude/skills/feature-loop/SKILL.md" ]
missing=""
for d in $FL_DEPS; do [ -f "$P/.claude/skills/$d/SKILL.md" ] || missing="$missing $d"; done
check "all $(echo $FL_DEPS | wc -w | tr -d ' ') dependencies installed${missing:+ (missing:$missing)}" [ -z "$missing" ]
check "transitive dep via feature-review (pre-merge-check) present" [ -d "$P/.claude/skills/pre-merge-check" ]
check "no unrelated skills (git-push absent)" [ ! -e "$P/.claude/skills/git-push" ]
check "feature-loop has all $FL_FILES files" [ "$(find "$P/.claude/skills/feature-loop" -type f ! -name .codegem-version | wc -l | tr -d ' ')" -eq "$FL_FILES" ]
check "version marker written" [ -s "$P/.claude/skills/feature-loop/.codegem-version" ]
check "files identical to source" diff -r -x .codegem-version "$SKILLS_SRC/feature-loop" "$P/.claude/skills/feature-loop"
check "summary printed" grep -q "Installed (" <<<"$OUT"

echo "2. executable bits preserved"
nonexec=""
for f in "$P"/.claude/skills/feature-loop/scripts/*.sh "$P"/.claude/skills/security-audit/scripts/*.sh; do
  [ -x "$f" ] || nonexec="$nonexec $(basename "$f")"
done
check "scripts/*.sh are executable${nonexec:+ (not:$nonexec)}" [ -z "$nonexec" ]
check "SKILL.md is not executable" [ ! -x "$P/.claude/skills/feature-loop/SKILL.md" ]

echo "3. skip if exists"
echo "LOCAL EDIT" >>"$P/.claude/skills/feature-loop/SKILL.md"
install "$P" feature-loop
check "exit 0" [ "$RC" -eq 0 ]
check "reports skipped" grep -q "Skipped, already installed (1): feature-loop" <<<"$OUT"
check "local edit kept" grep -q "LOCAL EDIT" "$P/.claude/skills/feature-loop/SKILL.md"
check "no backup made" [ ! -e "$P/.claude/skills/.backup" ]

echo "4. --force backs up the named skill only"
echo "DEP EDIT" >>"$P/.claude/skills/pre-merge-check/SKILL.md"
touch "$P/.claude/skills/feature-loop/stale-file.md"
install "$P" --force feature-loop
check "exit 0" [ "$RC" -eq 0 ]
BK="$(find "$P/.claude/skills/.backup" -mindepth 1 -maxdepth 1 -type d -name 'feature-loop-*' 2>/dev/null | head -1)"
check "backup folder created" [ -n "$BK" ]
check "backup holds the local edit" grep -q "LOCAL EDIT" "$BK/SKILL.md"
check "fresh copy has no local edit" bash -c "! grep -q 'LOCAL EDIT' '$P/.claude/skills/feature-loop/SKILL.md'"
check "stale file removed by fresh copy" [ ! -e "$P/.claude/skills/feature-loop/stale-file.md" ]
check "backup path printed" grep -q "old copy backed up to $BK" <<<"$OUT"
check "only one backup (deps not forced)" [ "$(find "$P/.claude/skills/.backup" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')" -eq 1 ]
check "dependency edit untouched" grep -q "DEP EDIT" "$P/.claude/skills/pre-merge-check/SKILL.md"
check "exec bits after --force" [ -x "$P/.claude/skills/feature-loop/scripts/run-orval.sh" ]

echo "5. --no-deps"
P="$WORK/p5"
install "$P" --no-deps feature-review
check "exit 0" [ "$RC" -eq 0 ]
check "only feature-review installed" [ "$(count_dirs "$P/.claude/skills")" -eq 1 ]

echo "6. several named skills, deduplicated"
P="$WORK/p6"
install "$P" quality-assurance pre-merge-check quality-assurance
check "exit 0" [ "$RC" -eq 0 ]
check "4 skills (qa + 3 deps)" [ "$(count_dirs "$P/.claude/skills")" -eq 4 ]

echo "7. --all"
P="$WORK/p7"
install "$P" --all
check "exit 0" [ "$RC" -eq 0 ]
check "all $TOTAL skills installed" [ "$(count_dirs "$P/.claude/skills")" -eq "$TOTAL" ]
check "every skill matches source" diff -r -x .codegem-version "$SKILLS_SRC" "$P/.claude/skills"
check "pentesting script executable" [ -x "$P/.claude/skills/pentesting/scripts/pentest-scope.sh" ]

echo "8. --global"
FAKEHOME="$WORK/home"
mkdir -p "$FAKEHOME"
P="$WORK/p8"
mkdir -p "$P"
set +e
OUT="$(cd "$P" && curl -fsSL "$URL/install.sh" | HOME="$FAKEHOME" "$INSTALL_BASH" -s -- --global git-push 2>&1)"
RC=$?
set -e
check "exit 0" [ "$RC" -eq 0 ]
check "installed into ~/.claude/skills" [ -f "$FAKEHOME/.claude/skills/git-push/SKILL.md" ]
check "nothing in project folder" [ ! -e "$P/.claude" ]

echo "9. bad input"
P="$WORK/p9"
install "$P" no-such-skill
check "unknown skill exits non-zero" [ "$RC" -ne 0 ]
check "nothing installed" [ ! -e "$P/.claude/skills/no-such-skill" ]
install "$P"
check "no args exits non-zero" [ "$RC" -ne 0 ]
install "$P" --list
check "--list shows skills" grep -q "feature-loop" <<<"$OUT"

echo "10. URL baked at build time vs runtime override"
P="$WORK/p10"
mkdir -p "$P"
set +e
OUT="$(cd "$P" && "$INSTALL_BASH" "$DIST/install.sh" pr-open 2>&1)"; RC=$?
set -e
if grep -q "SET-SITE_URL-AT-BUILD-TIME" "$DIST/install.sh"; then
  check "placeholder build refuses to run without a URL" [ "$RC" -ne 0 ]
fi
set +e
OUT="$(cd "$P" && CODEGEM_SKILLS_URL="$URL" "$INSTALL_BASH" "$DIST/install.sh" pr-open 2>&1)"; RC=$?
set -e
check "CODEGEM_SKILLS_URL override works" [ -f "$P/.claude/skills/pr-open/SKILL.md" ]

echo "11. --update"
P="$WORK/p11"
install "$P" feature-loop git-push
S="$P/.claude/skills"
mkdir -p "$S/my-own-skill" && echo "custom" >"$S/my-own-skill/SKILL.md"
install "$P" --update
check "exit 0 when everything is current" [ "$RC" -eq 0 ]
check "reports all up to date" grep -q "installed skills are up to date" <<<"$OUT"
check "lists new skills you don't have" grep -q "New skills you don't have yet" <<<"$OUT"
check "no backup when nothing changed" [ ! -e "$S/.backup" ]
# Simulate a newer site version of pre-merge-check, plus a local edit to it.
echo "stale" >"$S/pre-merge-check/.codegem-version"
echo "MY EDIT" >>"$S/pre-merge-check/SKILL.md"
# Simulate a skill installed before version markers existed.
rm "$S/git-push/.codegem-version"
install "$P" --update
check "exit 0" [ "$RC" -eq 0 ]
check "changed skill updated" grep -q "Updated (2): .*pre-merge-check" <<<"$OUT"
check "marker-less skill treated as outdated" grep -q "Updated (2): .*git-push" <<<"$OUT"
check "fresh copy matches source" diff -r -x .codegem-version "$SKILLS_SRC/pre-merge-check" "$S/pre-merge-check"
check "local edit kept in backup" grep -rq "MY EDIT" "$S/.backup"
check "unchanged skills left alone" grep -q "Already up to date" <<<"$OUT"
check "marker refreshed" [ "$(cat "$S/pre-merge-check/.codegem-version")" = "$(awk -F '\t' '$1=="skill" && $2=="pre-merge-check" {print $4}' "$SERVE/install-index.tsv")" ]
check "custom skill untouched" grep -q "custom" "$S/my-own-skill/SKILL.md"
check "only 2 backups made" [ "$(find "$S/.backup" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')" -eq 2 ]
install "$P" --update git-push
check "named update of a current skill: up to date" grep -q "installed skills are up to date" <<<"$OUT"
install "$P" --update team-pulse
check "updating a skill that isn't installed fails" [ "$RC" -ne 0 ]
install "$P" --update --all
check "--update --all is rejected" [ "$RC" -ne 0 ]
P="$WORK/p11-empty"
install "$P" --update
check "empty project: exit 0" [ "$RC" -eq 0 ]
check "empty project: says nothing installed" grep -q "No SkillFacet skills are installed" <<<"$OUT"
check "empty project: creates nothing" [ ! -e "$P/.claude" ]

echo ""
echo "install.sh smoke test: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
