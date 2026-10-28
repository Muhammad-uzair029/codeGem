#!/usr/bin/env bash
# Rule 02 [O]: Error Tracking — Sentry integration required.
. "$(dirname "$0")/_lib.sh"
RULE_ID=02; RULE_NAME="Error Tracking (Sentry)"; RULE_TAGS="O"
header
empty_repo_note

sentry_hits=0
for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
  [ -d "$d" ] || continue
  c=$(grep -RInE "(@sentry/|sentry_sdk|Sentry\.init|sentry\.io|SENTRY_DSN)" "$d" 2>/dev/null | wc -l | tr -d ' ')
  sentry_hits=$((sentry_hits + c))
done

if [ "$sentry_hits" -eq 0 ]; then
  fail "Sentry not integrated. Install @sentry/node|@sentry/react|sentry-sdk and call Sentry.init at app boot."
else
  pass "Sentry integration detected ($sentry_hits references)"
fi

# Check at least one Sentry.init call site
init_hits=0
for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
  [ -d "$d" ] || continue
  c=$(grep -RInE "(Sentry\.init|sentry_sdk\.init)" "$d" 2>/dev/null | wc -l | tr -d ' ')
  init_hits=$((init_hits + c))
done
if [ "$sentry_hits" -gt 0 ] && [ "$init_hits" -eq 0 ]; then
  warn "Sentry referenced but no Sentry.init / sentry_sdk.init call site found."
fi

finish
