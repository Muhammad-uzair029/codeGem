#!/usr/bin/env bash
# Rule 06 [S]: Authentication — no endpoint accidentally exposed without auth, incl. listeners/webhooks.
. "$(dirname "$0")/_lib.sh"
RULE_ID=06; RULE_NAME="Authentication (no exposed endpoints)"; RULE_TAGS="S"
header
empty_repo_note

# Common patterns: NestJS @Public(), Express routes with no auth middleware, FastAPI without Depends(auth)
violations=0
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue

  # NestJS: @Public() decorator without explicit comment
  if grep -nE "@Public\(\)" "$f" 2>/dev/null | grep -v "//" >/dev/null 2>&1; then
    line=$(grep -nE "@Public\(\)" "$f" | head -1)
    warn "$f:$line uses @Public() — confirm endpoint is intentionally unauthenticated"
  fi

  # Express routes without middleware preceding handler — heuristic
  if grep -qE "(router|app)\.(get|post|put|delete|patch)\s*\(" "$f" 2>/dev/null; then
    if ! grep -qE "(authMiddleware|requireAuth|passport\.authenticate|verifyToken|@UseGuards|isAuthenticated|jwtAuth)" "$f" 2>/dev/null; then
      case "$f" in
        */routes/*|*/controllers/*|*/api/*|*/handlers/*)
          fail "$f defines route(s) without visible auth middleware"
          violations=$((violations + 1))
          ;;
      esac
    fi
  fi

  # FastAPI router functions w/o Depends auth
  if grep -qE "@(app|router)\.(get|post|put|delete|patch)\(" "$f" 2>/dev/null; then
    if ! grep -qE "Depends\([a-zA-Z_]*(auth|user|token|jwt)" "$f" 2>/dev/null; then
      case "$f" in
        */routes/*|*/api/*|*/endpoints/*)
          fail "$f defines FastAPI route without Depends(auth*)"
          violations=$((violations + 1))
          ;;
      esac
    fi
  fi
done < <(find_files ts js py)

# Webhook / event listener endpoints — must auth via signature; bare path is a red flag
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -qE "/(webhook|webhooks|listener|callback)" "$f" 2>/dev/null; then
    if ! grep -qE "(verifySignature|verify_signature|stripe\.webhooks\.constructEvent|hmac|HMAC|x-signature|svix)" "$f" 2>/dev/null; then
      fail "$f exposes webhook/listener path without signature verification"
      violations=$((violations + 1))
    fi
  fi
done < <(find_files ts js py)

[ "$violations" -eq 0 ] && pass "no unauthenticated routes detected"
finish
