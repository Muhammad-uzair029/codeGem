#!/usr/bin/env bash
# Rule 11 [S]: Side-Channel — login/auth must mitigate timing attacks (constant-time compare).
. "$(dirname "$0")/_lib.sh"
RULE_ID=11; RULE_NAME="Timing-attack mitigation in auth"; RULE_TAGS="S"
header
empty_repo_note

violations=0
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  case "$f" in
    *auth*|*login*|*session*|*token*|*password*)
      # If file does plain == compare on secret-like vars, flag it.
      if grep -qE "(password|token|hash|secret|api[_-]?key)\s*===?\s*[\"a-zA-Z_]" "$f" 2>/dev/null; then
        if ! grep -qE "(timingSafeEqual|hmac\.compare_digest|constant_time|safe_compare|secureCompare|crypto_subtle)" "$f" 2>/dev/null; then
          fail "$f compares secret with == / === — use crypto.timingSafeEqual / hmac.compare_digest"
          violations=$((violations + 1))
        fi
      fi
      ;;
  esac
done < <(find_files ts js py)

[ "$violations" -eq 0 ] && pass "no obvious non-constant-time secret comparisons in auth files"
finish
