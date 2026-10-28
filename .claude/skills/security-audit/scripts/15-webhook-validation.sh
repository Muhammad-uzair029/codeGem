#!/usr/bin/env bash
# Rule 15 [S]: Webhook Validation — every webhook must verify payload signature.
. "$(dirname "$0")/_lib.sh"
RULE_ID=15; RULE_NAME="Webhook signature verification"; RULE_TAGS="S"
header
empty_repo_note

violations=0
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -qE "/(webhook|webhooks|hook|callback)([\"'/?])" "$f" 2>/dev/null; then
    if ! grep -qE "(verifySignature|verify_signature|constructEvent|svix|x-hub-signature|x-signature|hmac|HMAC|crypto\.createHmac|hmac\.compare_digest)" "$f" 2>/dev/null; then
      fail "$f exposes webhook path without signature verification"
      violations=$((violations + 1))
    fi
  fi
done < <(find_files ts js py)

[ "$violations" -eq 0 ] && pass "no unverified webhook endpoints detected"
finish
