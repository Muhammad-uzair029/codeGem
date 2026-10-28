#!/usr/bin/env bash
# Run every rule script in .claude/bin/NN-*.sh in order. Aggregate pass/fail.
set -u
BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -t 1 ]; then
  C_RED='\033[0;31m'; C_GRN='\033[0;32m'; C_YLW='\033[0;33m'; C_BLU='\033[0;34m'; C_DIM='\033[2m'; C_RST='\033[0m'
else
  C_RED=''; C_GRN=''; C_YLW=''; C_BLU=''; C_DIM=''; C_RST=''
fi

total=0; passed=0; failed=0; failed_rules=()

shopt -s nullglob
for s in "$BIN_DIR"/[0-9][0-9]-*.sh; do
  total=$((total + 1))
  echo
  printf "${C_DIM}────────────────────────────────────────────────${C_RST}\n"
  if bash "$s"; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
    failed_rules+=("$(basename "$s")")
  fi
done

echo
printf "${C_DIM}════════════════════════════════════════════════${C_RST}\n"
printf "${C_BLU}Security & Compliance Audit Summary${C_RST}\n"
printf "  total:  %d\n" "$total"
printf "  ${C_GRN}passed: %d${C_RST}\n" "$passed"
printf "  ${C_RED}failed: %d${C_RST}\n" "$failed"
if [ "$failed" -gt 0 ]; then
  echo
  printf "${C_RED}Failed rules:${C_RST}\n"
  for r in "${failed_rules[@]}"; do
    printf "  - %s\n" "$r"
  done
  exit 1
fi
exit 0
