#!/usr/bin/env bash
# Rule 42 [S]: Response-time normalization — login/auth failures must take similar (or randomized)
# time regardless of which factor failed, to defeat timing oracles.
. "$(dirname "$0")/_lib.sh"
RULE_ID=42; RULE_NAME="Response-time normalization (auth)"; RULE_TAGS="S"
header
empty_repo_note

auth_files=()
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  case "$f" in
    *auth*|*login*|*signin*|*sign-in*|*sign_in*|*session*|*password*)
      auth_files+=("$f")
      ;;
  esac
done < <(find_files ts tsx js jsx py)

if [ "${#auth_files[@]}" -eq 0 ]; then
  info "no auth/login files found yet — rule applies once auth lands"
  finish
fi

violations=0
for f in "${auth_files[@]}"; do
  # Must contain at least one of: artificial delay / randomized jitter
  if ! grep -qE "(setTimeout\(.*resolve|await\s+sleep\(|await\s+asyncio\.sleep\(|time\.sleep\(|delay\(|randomDelay|constantTime|timingSafeEqual|hmac\.compare_digest)" "$f" 2>/dev/null; then
    # Only flag if file actually returns a response (rough heuristic)
    if grep -qE "(res\.(json|send|status)|return\s+(jsonify|HttpResponse|JsonResponse)|raise\s+HTTPException|UnauthorizedException)" "$f" 2>/dev/null; then
      fail "$f → auth/login path with no artificial delay or constant-time compare (timing-oracle risk)"
      violations=$((violations + 1))
    fi
  fi

  # Early-return-on-missing-user (classic timing leak): user not found → return immediately, password check skipped
  if grep -qE "(User\.findOne|users\.find_one|select.*from\s+users).*await" "$f" 2>/dev/null; then
    if grep -nE "if\s*\(?\s*!?\s*(user|account)\s*\)?\s*[:{]?\s*(return|throw|raise)" "$f" 2>/dev/null | head -2 | grep -q .; then
      if ! grep -qE "(dummy.*(hash|password)|noopHash|constantHash|placeholder.*compare)" "$f" 2>/dev/null; then
        warn "$f → user-not-found short-circuits before password check (timing distinguishable from wrong-password). Always run a dummy hash compare."
      fi
    fi
  fi
done

[ "$violations" -eq 0 ] && pass "auth/login files include delay or constant-time primitives"
finish
