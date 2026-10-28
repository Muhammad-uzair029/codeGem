#!/usr/bin/env bash
# Shared helpers for security/compliance validation scripts.
# Source from each rule script: . "$(dirname "$0")/_lib.sh"

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
SCAN_ROOTS_DEFAULT=("$REPO_ROOT/apps" "$REPO_ROOT/.github" "$REPO_ROOT/infra" "$REPO_ROOT/terraform")

# Color codes (disabled when not a TTY)
if [ -t 1 ]; then
  C_RED='\033[0;31m'; C_GRN='\033[0;32m'; C_YLW='\033[0;33m'; C_BLU='\033[0;34m'; C_DIM='\033[2m'; C_RST='\033[0m'
else
  C_RED=''; C_GRN=''; C_YLW=''; C_BLU=''; C_DIM=''; C_RST=''
fi

RULE_ID="${RULE_ID:-?}"
RULE_NAME="${RULE_NAME:-unnamed}"
RULE_TAGS="${RULE_TAGS:-}"

VIOLATIONS=0
WARNINGS=0
FINDINGS=()

header() {
  printf "${C_BLU}[Rule %s]${C_RST} %s ${C_DIM}(%s)${C_RST}\n" "$RULE_ID" "$RULE_NAME" "$RULE_TAGS"
}

fail() {
  VIOLATIONS=$((VIOLATIONS + 1))
  FINDINGS+=("FAIL: $*")
  printf "  ${C_RED}✗${C_RST} %s\n" "$*"
}

warn() {
  WARNINGS=$((WARNINGS + 1))
  FINDINGS+=("WARN: $*")
  printf "  ${C_YLW}!${C_RST} %s\n" "$*"
}

pass() {
  printf "  ${C_GRN}✓${C_RST} %s\n" "$*"
}

info() {
  printf "  ${C_DIM}· %s${C_RST}\n" "$*"
}

# Return 0 iff scan target exists with any source files.
scan_targets_exist() {
  for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
    [ -d "$d" ] && return 0
  done
  return 1
}

# Find source files (TS/JS/Python) inside scan roots. Echoes newline-separated paths.
find_sources() {
  local exts="${1:-ts,tsx,js,jsx,py}"
  local results=""
  for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
    [ -d "$d" ] || continue
    results="$results$(find "$d" -type f \( $(echo "$exts" | tr ',' '\n' | sed 's/^/-name "*./; s/$/" -o/' | tr '\n' ' ' | sed 's/-o $//' ) \) 2>/dev/null)
"
  done
  printf "%s" "$results" | sed '/^$/d'
}

# Simpler find using a fixed extension list. Pass extensions as args (without dot).
find_files() {
  local exts=("$@")
  local args=()
  if [ ${#exts[@]} -eq 0 ]; then
    exts=(ts tsx js jsx py)
  fi
  args+=("(")
  local first=1
  for e in "${exts[@]}"; do
    if [ $first -eq 1 ]; then first=0; else args+=("-o"); fi
    args+=("-name" "*.$e")
  done
  args+=(")")
  for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
    [ -d "$d" ] || continue
    find "$d" -type f "${args[@]}" 2>/dev/null
  done
}

# Grep across scan roots. Returns 0 if matches found, 1 otherwise. Echoes matches.
scan_grep() {
  local pattern="$1"; shift
  local any=1
  for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
    [ -d "$d" ] || continue
    if grep -RInE --color=never "$pattern" "$d" "$@" 2>/dev/null; then
      any=0
    fi
  done
  return $any
}

finish() {
  echo
  if [ "$VIOLATIONS" -gt 0 ]; then
    printf "${C_RED}Rule %s FAILED${C_RST} — %d violation(s), %d warning(s)\n" "$RULE_ID" "$VIOLATIONS" "$WARNINGS"
    exit 1
  fi
  if [ "$WARNINGS" -gt 0 ]; then
    printf "${C_YLW}Rule %s PASS (with warnings)${C_RST} — %d warning(s)\n" "$RULE_ID" "$WARNINGS"
    exit 0
  fi
  printf "${C_GRN}Rule %s PASS${C_RST}\n" "$RULE_ID"
  exit 0
}

# Empty-repo guard for template state.
empty_repo_note() {
  if ! scan_targets_exist; then
    info "no apps/ or infra/ present yet — template state; rule applies once workspaces land"
  fi
}
