#!/usr/bin/env bash
# codeGem skills installer (macOS / Linux).
#
#   curl -fsSL @@SITE_URL@@/install.sh | bash -s -- feature-loop pre-merge-check
#   curl -fsSL @@SITE_URL@@/install.sh | bash -s -- --all
#
# Options:
#   <skill> ...    Skills to install. Skills they use are installed too.
#   --all          Install every skill.
#   --global       Install into ~/.claude/skills (all projects) instead of ./.claude/skills.
#   --no-deps      Do not install the skills a named skill uses.
#   --force        Replace skills you named that are already installed. The old copy is
#                  moved to .claude/skills/.backup/<name>-<timestamp>/ first.
#                  Never applies to skills pulled in as dependencies.
#   --list         List available skills and exit.
#   -h, --help     Show this help.
#
# Files are downloaded only from the skills site, never from GitHub.
# To point at a different site, set CODEGEM_SKILLS_URL=https://your-site.example
#
# Written for stock bash 3.2 (macOS) and curl. Everything runs inside main()
# so a half-downloaded script never executes.

CODEGEM_BAKED_URL="@@SITE_URL@@"

cg_say() { printf '%s\n' "$*"; }
cg_err() { printf 'error: %s\n' "$*" >&2; }

cg_usage() {
  cat <<'USAGE'
codeGem skills installer

Usage:  install.sh [options] <skill> [<skill> ...]
        install.sh --all

Options:
  --all        Install every skill
  --global     Install into ~/.claude/skills (all projects) instead of ./.claude/skills
  --no-deps    Skip the skills a named skill uses
  --force      Replace skills you named that are already installed
               (old copy is backed up to .claude/skills/.backup/<name>-<timestamp>/)
  --list       List available skills
  -h, --help   Show this help
USAGE
}

cg_in_list() {
  # cg_in_list <needle> <items...>
  local needle="$1"; shift
  local item
  for item in "$@"; do [ "$item" = "$needle" ] && return 0; done
  return 1
}

cg_join() {
  # cg_join <sep> <items...>
  local sep="$1"; shift
  local out="" item
  for item in "$@"; do
    if [ -z "$out" ]; then out="$item"; else out="$out$sep$item"; fi
  done
  printf '%s' "$out"
}

main() {
  set -euo pipefail

  local want_all=0 global=0 no_deps=0 force=0 list=0
  local names=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --all) want_all=1 ;;
      --global|-g) global=1 ;;
      --no-deps) no_deps=1 ;;
      --force|-f) force=1 ;;
      --list|-l) list=1 ;;
      -h|--help) cg_usage; return 0 ;;
      -*) cg_err "unknown option: $1"; cg_usage >&2; return 2 ;;
      *) names+=("$1") ;;
    esac
    shift
  done

  local base="${CODEGEM_SKILLS_URL:-$CODEGEM_BAKED_URL}"
  base="${base%/}"
  case "$base" in
    *SET-SITE_URL-AT-BUILD-TIME*|*@@SITE_URL*)
      cg_err "this installer was built without a site URL."
      cg_err "Re-run with CODEGEM_SKILLS_URL=https://<your-skills-site> set, or rebuild the site with SITE_URL set."
      return 1 ;;
  esac

  if ! command -v curl >/dev/null 2>&1; then
    cg_err "curl is required but was not found."
    return 1
  fi

  local tmp
  tmp="$(mktemp -d 2>/dev/null || mktemp -d -t codegem-skills)"
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" EXIT

  local index="$tmp/index.tsv"
  if ! curl -fsSL --retry 2 "$base/install-index.tsv" -o "$index"; then
    cg_err "could not download the skill list from $base/install-index.tsv"
    return 1
  fi

  # Read the index: "skill<TAB>name<TAB>deps" lines.
  local all_skills=() kind a b c
  while IFS="$(printf '\t')" read -r kind a b c; do
    if [ "$kind" = "skill" ]; then all_skills+=("$a"); fi
  done < "$index"
  if [ ${#all_skills[@]} -eq 0 ]; then
    cg_err "the skill list from $base is empty or unreadable."
    return 1
  fi

  if [ "$list" -eq 1 ]; then
    cg_say "Available skills (${#all_skills[@]}):"
    local s
    for s in "${all_skills[@]}"; do cg_say "  $s"; done
    return 0
  fi

  if [ "$want_all" -eq 1 ]; then
    names=("${all_skills[@]}")
  fi
  if [ ${#names[@]} -eq 0 ]; then
    cg_err "name at least one skill, or use --all."
    cg_usage >&2
    return 2
  fi

  # Validate names before touching anything.
  local n bad=()
  for n in "${names[@]}"; do
    if ! cg_in_list "$n" "${all_skills[@]}"; then bad+=("$n"); fi
  done
  if [ ${#bad[@]} -gt 0 ]; then
    cg_err "unknown skill(s): $(cg_join ', ' "${bad[@]}")"
    cg_err "run with --list to see what is available."
    return 2
  fi

  # Plan: named skills first (deduplicated), then their resolved dependencies.
  local requested=() plan=()
  for n in "${names[@]}"; do
    cg_in_list "$n" ${requested[@]+"${requested[@]}"} || requested+=("$n")
  done
  plan=("${requested[@]}")
  if [ "$no_deps" -eq 0 ]; then
    local deps d
    for n in "${requested[@]}"; do
      deps="$(awk -F '\t' -v s="$n" '$1=="skill" && $2==s {print $3}' "$index")"
      if [ "$deps" = "-" ]; then deps=""; fi
      local IFS_SAVE="$IFS"; IFS=','
      for d in $deps; do
        cg_in_list "$d" "${plan[@]}" || plan+=("$d")
      done
      IFS="$IFS_SAVE"
    done
  fi

  local target
  if [ "$global" -eq 1 ]; then
    target="$HOME/.claude/skills"
  else
    target="$(pwd)/.claude/skills"
  fi
  mkdir -p "$target"

  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"

  local installed=() updated=() backups=() skipped=() skipped_deps=()
  local name explicit dest stage
  for name in "${plan[@]}"; do
    explicit=0
    if cg_in_list "$name" "${requested[@]}"; then explicit=1; fi
    dest="$target/$name"

    if [ -e "$dest" ]; then
      if [ "$explicit" -eq 1 ] && [ "$force" -eq 1 ]; then
        :
      elif [ "$explicit" -eq 1 ]; then
        skipped+=("$name"); continue
      else
        skipped_deps+=("$name"); continue
      fi
    fi

    # Download into a staging folder first, so a failed download never
    # touches an existing install.
    stage="$tmp/stage/$name"
    mkdir -p "$stage"
    local args=() execs=() x p
    while IFS="$(printf '\t')" read -r kind a x p; do
      if [ "$kind" != "file" ] || [ "$a" != "$name" ]; then continue; fi
      case "$p" in /*|*..*) cg_err "refusing unsafe path in index: $p"; return 1 ;; esac
      args+=(-o "$stage/$p" "$base/skills/$name/$p")
      if [ "$x" = "x" ]; then execs+=("$stage/$p"); fi
    done < "$index"
    if [ ${#args[@]} -eq 0 ]; then
      cg_err "no files listed for $name"
      return 1
    fi
    cg_say "Downloading $name ..."
    if ! curl -fsSL --retry 2 --create-dirs "${args[@]}"; then
      cg_err "download failed for $name; nothing was changed for this skill."
      return 1
    fi
    local f
    for f in ${execs[@]+"${execs[@]}"}; do chmod +x "$f"; done

    if [ -e "$dest" ]; then
      local backup="$target/.backup/$name-$stamp" i=1
      while [ -e "$backup" ]; do backup="$target/.backup/$name-$stamp-$i"; i=$((i + 1)); done
      mkdir -p "$target/.backup"
      mv "$dest" "$backup"
      mv "$stage" "$dest"
      updated+=("$name"); backups+=("$backup")
    else
      mv "$stage" "$dest"
      installed+=("$name")
    fi
  done

  cg_say ""
  cg_say "codeGem skills -> $target"
  if [ ${#installed[@]} -gt 0 ]; then
    cg_say "  Installed (${#installed[@]}): $(cg_join ', ' "${installed[@]}")"
  fi
  if [ ${#updated[@]} -gt 0 ]; then
    cg_say "  Updated (${#updated[@]}): $(cg_join ', ' "${updated[@]}")"
    for f in "${backups[@]}"; do cg_say "    old copy backed up to $f"; done
  fi
  if [ ${#skipped[@]} -gt 0 ]; then
    cg_say "  Skipped, already installed (${#skipped[@]}): $(cg_join ', ' "${skipped[@]}")"
    cg_say "    to update: re-run with --force $(cg_join ' ' "${skipped[@]}")"
  fi
  if [ ${#skipped_deps[@]} -gt 0 ]; then
    cg_say "  Dependencies already installed, left as is (${#skipped_deps[@]}): $(cg_join ', ' "${skipped_deps[@]}")"
    if [ "$force" -eq 1 ]; then
      cg_say "    --force only replaces skills you name; name these to update them."
    fi
  fi
  if [ ${#installed[@]} -eq 0 ] && [ ${#updated[@]} -eq 0 ]; then
    cg_say "  Nothing new to install."
  fi
  cg_say ""
  if [ "$global" -eq 1 ]; then
    cg_say "Next: open any project in Claude Code (run: claude) and type /${requested[0]}"
  else
    cg_say "Next: in this folder, run: claude   then type /${requested[0]}"
  fi
}

main "$@"
