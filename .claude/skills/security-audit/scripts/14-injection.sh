#!/usr/bin/env bash
# Rule 14 [S]: Injection Defenses — block XSS, CSRF, SQLi via parameterization + sanitization.
. "$(dirname "$0")/_lib.sh"
RULE_ID=14; RULE_NAME="Injection Defenses (XSS/CSRF/SQLi)"; RULE_TAGS="S"
header
empty_repo_note

violations=0

# Raw SQL string concatenation
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -nE "(SELECT|INSERT|UPDATE|DELETE).*['\"].*\+\s*[a-zA-Z_]" "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → SQL built via string concatenation (use parameterized query / ORM bindings)"
    violations=$((violations + 1))
  fi
  # Python f-string SQL
  if grep -nE "execute\(\s*f['\"]" "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → execute(f\"...\") — f-string SQL is injectable; pass params separately"
    violations=$((violations + 1))
  fi
done < <(find_files ts js py)

# XSS: dangerouslySetInnerHTML / innerHTML / v-html without sanitizer
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -qE "(dangerouslySetInnerHTML|\.innerHTML\s*=|v-html=)" "$f" 2>/dev/null; then
    if ! grep -qE "(DOMPurify|sanitize|bleach|escapeHtml)" "$f" 2>/dev/null; then
      fail "$f → raw HTML sink without sanitizer (DOMPurify/bleach/escape)"
      violations=$((violations + 1))
    fi
  fi
done < <(find_files ts tsx js jsx vue)

# CSRF middleware presence on stateful endpoints
csrf=0
for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
  [ -d "$d" ] || continue
  c=$(grep -RInE "(csurf|csrf|@nestjs/csrf|fastapi_csrf_protect|SameSite=Strict|SameSite=\"Strict\")" "$d" 2>/dev/null | wc -l | tr -d ' ')
  csrf=$((csrf + c))
done
if [ "$csrf" -eq 0 ]; then
  warn "no CSRF middleware / SameSite=Strict cookie config detected"
fi

[ "$violations" -eq 0 ] && pass "no concatenated-SQL or unsanitized-HTML sinks detected"
finish
