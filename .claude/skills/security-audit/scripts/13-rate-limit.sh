#!/usr/bin/env bash
# Rule 13 [S/R]: Traffic Control — global + per-user rate limiting.
. "$(dirname "$0")/_lib.sh"
RULE_ID=13; RULE_NAME="Rate Limiting (global + per-user)"; RULE_TAGS="S/R"
header
empty_repo_note

rl=0
for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
  [ -d "$d" ] || continue
  c=$(grep -RInE "(express-rate-limit|rate-limiter-flexible|@nestjs/throttler|slowapi|fastapi-limiter|rateLimit\(|Throttle\()" "$d" 2>/dev/null | wc -l | tr -d ' ')
  rl=$((rl + c))
done

if [ "$rl" -eq 0 ]; then
  fail "no rate-limiting middleware found (express-rate-limit / @nestjs/throttler / slowapi / fastapi-limiter)."
else
  pass "rate-limit middleware present ($rl refs)"
fi

# Per-user keying check — must use user id / api key, not just IP
per_user=0
for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
  [ -d "$d" ] || continue
  c=$(grep -RInE "(keyGenerator|key_func|keyPrefix).*((req|request)\.user|userId|api[_-]?key|sub)" "$d" 2>/dev/null | wc -l | tr -d ' ')
  per_user=$((per_user + c))
done
if [ "$rl" -gt 0 ] && [ "$per_user" -eq 0 ]; then
  warn "rate-limit found but no per-user key generator detected — global limits only is insufficient"
fi

finish
