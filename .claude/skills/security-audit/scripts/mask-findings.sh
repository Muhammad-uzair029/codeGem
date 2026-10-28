#!/usr/bin/env bash
# Scan a target file for unmasked sensitive values and (optionally) rewrite them
# in place with safe masks. Patterns mirror the "Masking sensitive findings"
# section of SKILL.md.
#
# Usage:
#   bash mask-findings.sh <path>             # dry-run (default) — reports hits
#   bash mask-findings.sh <path> --apply     # rewrites in place
#
# Exit codes:
#   0 — no hits, or --apply succeeded
#   1 — dry-run found hits (caller should review and re-run with --apply)
#   2 — invalid usage / unreadable file

set -u

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <path-to-file> [--apply]" >&2
  exit 2
fi

TARGET="$1"
APPLY=0
[ "${2:-}" = "--apply" ] && APPLY=1

if [ ! -f "$TARGET" ]; then
  echo "error: file not found: $TARGET" >&2
  exit 2
fi

if [ -t 1 ]; then
  C_RED='\033[0;31m'; C_GRN='\033[0;32m'; C_YLW='\033[0;33m'; C_DIM='\033[2m'; C_RST='\033[0m'
else
  C_RED=''; C_GRN=''; C_YLW=''; C_DIM=''; C_RST=''
fi

hits=0

# Pattern 1: public IPv4 (skip RFC1918, loopback, link-local, multicast, broadcast)
public_ipv4_pattern='\b(([0-9]{1,3}\.){3}[0-9]{1,3})\b'
private_ip_filter='(^|[^0-9])(10\.|127\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|0\.0\.0\.0|255\.|169\.254\.|22[4-9]\.|23[0-9]\.)'

# Pattern 2: 12-digit AWS account id (with word boundaries; avoid 12-digit timestamps inside other tokens)
aws_acct_pattern='\b[0-9]{12}\b'

# Pattern 3: AWS access key id
aws_akid_pattern='\bAKIA[0-9A-Z]{16}\b'

# Pattern 4: JWT (three base64url segments)
jwt_pattern='\beyJ[A-Za-z0-9_=-]+\.eyJ[A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+\b'

# Pattern 5: Stripe / OpenAI / Anthropic-style API keys
sk_pattern='\b(sk_live_|sk_test_|sk-ant-|sk-)[A-Za-z0-9_-]{16,}\b'

# Pattern 6: email addresses
email_pattern='\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'

report_pattern() {
  local label="$1"
  local pattern="$2"
  local matches
  matches=$(grep -nEo "$pattern" "$TARGET" 2>/dev/null || true)

  if [ "$label" = "public IPv4" ]; then
    matches=$(echo "$matches" | grep -vE "$private_ip_filter" || true)
  fi

  if [ -n "$matches" ]; then
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      hits=$((hits + 1))
      printf "  ${C_YLW}!${C_RST} %s: %s\n" "$label" "$line"
    done <<< "$matches"
  fi
}

apply_masks() {
  local tmp
  tmp=$(mktemp)
  cp "$TARGET" "$tmp"

  # public IPv4 → first.second.***.***
  # Two-pass: protect private/loopback first, then mask the rest.
  perl -i -pe '
    s{\b((?:10\.|127\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|0\.0\.0\.0|255\.|169\.254\.|22[4-9]\.|23[0-9]\.)(?:[0-9]{1,3}\.){0,3}[0-9]{1,3})\b}{__KEEPIP__$1__KEEPIP__}g;
    s{\b(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}\b}{$1.$2.***.***}g;
    s{__KEEPIP__([^_]+)__KEEPIP__}{$1}g;
  ' "$tmp"

  # AWS access key id
  perl -i -pe 's{\b(AKIA)[0-9A-Z]{12}([0-9A-Z]{4})\b}{$1***$2}g' "$tmp"

  # JWT → eyJ***[truncated]
  perl -i -pe 's{\beyJ[A-Za-z0-9_=-]+\.eyJ[A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+\b}{eyJ***[jwt-redacted]}g' "$tmp"

  # Stripe / sk-ant- / sk_ style — drop everything after the prefix
  perl -i -pe 's{\b(sk_live_|sk_test_|sk-ant-|sk-)[A-Za-z0-9_-]{16,}\b}{$1***}g' "$tmp"

  # Emails: local-part → first char + ***  (domain kept; TLD kept).
  # Use s|...|...| delimiters and explicit ${N} interpolation so `@` is
  # not parsed as an array sigil.
  perl -i -pe 's|\b([A-Za-z0-9])[A-Za-z0-9._%+-]*\@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b|${1}***\@${2}|g' "$tmp"

  # 12-digit AWS account id (after the IP rewrites so we don't clobber)
  perl -i -pe 's{\b\d{3}\d{6}(\d{3})\b}{***$1}g' "$tmp"

  mv "$tmp" "$TARGET"
}

printf "${C_DIM}scanning${C_RST} %s\n" "$TARGET"

report_pattern "public IPv4"       "$public_ipv4_pattern"
report_pattern "AWS account id"    "$aws_acct_pattern"
report_pattern "AWS access key id" "$aws_akid_pattern"
report_pattern "JWT"               "$jwt_pattern"
report_pattern "API key (sk_/sk-)" "$sk_pattern"
report_pattern "email"             "$email_pattern"

if [ "$hits" -eq 0 ]; then
  printf "${C_GRN}clean${C_RST} — no unmasked sensitive values\n"
  exit 0
fi

if [ "$APPLY" -eq 1 ]; then
  apply_masks
  printf "${C_GRN}masked${C_RST} %d hit(s) in %s — re-run without --apply to verify\n" "$hits" "$TARGET"
  exit 0
fi

printf "${C_RED}%d unmasked finding(s)${C_RST} — re-run with --apply to rewrite, or mask manually\n" "$hits"
exit 1
