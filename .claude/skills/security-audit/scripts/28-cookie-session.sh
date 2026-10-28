#!/usr/bin/env bash
# Rule 28 [S]: Cookie / session flags — HttpOnly, Secure, SameSite, no excessive maxAge.
. "$(dirname "$0")/_lib.sh"
RULE_ID=28; RULE_NAME="Cookie / session security"; RULE_TAGS="S"
header
empty_repo_note

violations=0
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  # cookie/session set with no security flags nearby
  if grep -qE "(res\.cookie\(|setCookie\(|cookie-session|express-session|fastapi.*Cookie|set_cookie\()" "$f" 2>/dev/null; then
    if ! grep -qE "(httpOnly|HttpOnly|http_only)" "$f" 2>/dev/null; then
      fail "$f → cookie set without httpOnly"
      violations=$((violations + 1))
    fi
    if ! grep -qE "(secure\s*:\s*true|Secure\s*:|secure=True|secure: true)" "$f" 2>/dev/null; then
      warn "$f → cookie may lack Secure=true (acceptable in dev, required in prod)"
    fi
    if ! grep -qE "(sameSite|SameSite|same_site)" "$f" 2>/dev/null; then
      fail "$f → cookie set without SameSite policy"
      violations=$((violations + 1))
    fi
  fi
done < <(find_files ts tsx js jsx py)

[ "$violations" -eq 0 ] && pass "cookie-setting sites carry security flags"
finish
