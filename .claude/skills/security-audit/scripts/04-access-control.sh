#!/usr/bin/env bash
# Rule 04 [S]: Access Control — IDOR and Privilege Escalation scan on controllers.
. "$(dirname "$0")/_lib.sh"
RULE_ID=04; RULE_NAME="Access Control (IDOR/PrivEsc)"; RULE_TAGS="S"
header
empty_repo_note

# Heuristic 1: route handlers reading :id / req.params.id without auth/owner check
suspect=0
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  # Files using params.id but no ownership/auth check nearby
  if grep -qE "(params\.id|params\[.id.\]|request\.params)" "$f" 2>/dev/null; then
    if ! grep -qE "(userId|ownerId|currentUser|req\.user|getUser|@UseGuards|@Auth|requireAuth|is_owner|owner_id|tenant_id)" "$f" 2>/dev/null; then
      fail "potential IDOR: $f reads request id without visible ownership/auth check"
      suspect=$((suspect + 1))
    fi
  fi
done < <(find_files ts tsx js py)

# Heuristic 2: role checks done by client-side flag only
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -qE "(role\s*===?\s*['\"]admin['\"]|isAdmin\s*===?\s*true)" "$f" 2>/dev/null; then
    case "$f" in
      */frontend-ui/*) warn "client-side role check in $f — must be enforced server-side too" ;;
    esac
  fi
done < <(find_files ts tsx js)

if [ "$suspect" -eq 0 ]; then
  pass "no obvious IDOR pattern detected"
fi
finish
