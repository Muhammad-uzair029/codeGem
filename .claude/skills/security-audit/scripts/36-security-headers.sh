#!/usr/bin/env bash
# Rule 36 [S]: Security headers — CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
. "$(dirname "$0")/_lib.sh"
RULE_ID=36; RULE_NAME="Security headers"; RULE_TAGS="S"
header
empty_repo_note

names=(
  "Content-Security-Policy"
  "X-Frame-Options"
  "X-Content-Type-Options"
  "Referrer-Policy"
  "Permissions-Policy"
)
patterns=(
  "contentSecurityPolicy|Content-Security-Policy"
  "X-Frame-Options|frameguard"
  "X-Content-Type-Options|noSniff"
  "Referrer-Policy|referrerPolicy"
  "Permissions-Policy|permissionsPolicy|featurePolicy"
)

for i in "${!names[@]}"; do
  hits=0
  for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
    [ -d "$d" ] || continue
    c=$(grep -RInE "${patterns[$i]}" "$d" 2>/dev/null | wc -l | tr -d ' ')
    hits=$((hits + c))
  done
  if [ "$hits" -eq 0 ]; then
    fail "missing security header config: ${names[$i]}"
  else
    pass "${names[$i]} configured ($hits refs)"
  fi
done

if scan_grep "helmet\(\s*\)" > /dev/null; then
  warn "helmet() called without explicit CSP options — verify CSP is enabled and tight"
fi

finish
