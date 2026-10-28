#!/usr/bin/env bash
# Rule 26 [S]: TLS / HTTPS enforcement — HSTS header, no http:// in prod, TLS verify on.
. "$(dirname "$0")/_lib.sh"
RULE_ID=26; RULE_NAME="TLS / HTTPS enforcement"; RULE_TAGS="S"
header
empty_repo_note

violations=0

# HSTS header present somewhere
hsts=0
for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
  [ -d "$d" ] || continue
  c=$(grep -RInE "(Strict-Transport-Security|hsts\s*[:(])" "$d" 2>/dev/null | wc -l | tr -d ' ')
  hsts=$((hsts + c))
done
if [ "$hsts" -eq 0 ]; then
  fail "no Strict-Transport-Security / HSTS header configured"
  violations=$((violations + 1))
else
  pass "HSTS header configured ($hsts refs)"
fi

# http:// URLs hitting prod-looking hosts (heuristic — exclude localhost / 127 / example)
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  hits=$(grep -nE "http://[a-z0-9.-]+\.(com|net|io|co|org|cloud|app|dev)" "$f" 2>/dev/null \
         | grep -vE "(localhost|127\.0\.0\.1|example\.com|test\.com)" | head -3)
  if [ -n "$hits" ]; then
    while IFS= read -r h; do
      fail "$f → plaintext http:// URL to public host: $h"
      violations=$((violations + 1))
    done <<< "$hits"
  fi
done < <(find_files ts tsx js jsx py)

# TLS verify disabled
if scan_grep "(NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['\"]?0|rejectUnauthorized\s*:\s*false|verify\s*=\s*False|ssl_verify\s*=\s*False)" > /dev/null; then
  fail "TLS verification disabled somewhere — MITM risk"
  violations=$((violations + 1))
fi

[ "$violations" -eq 0 ] && pass "no plaintext or insecure-TLS patterns detected"
finish
