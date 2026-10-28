#!/usr/bin/env bash
# Rule 37 [S/R]: Request body size limit — block DoS via huge payloads.
. "$(dirname "$0")/_lib.sh"
RULE_ID=37; RULE_NAME="Body size limit"; RULE_TAGS="S/R"
header
empty_repo_note

limit_hits=0
for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
  [ -d "$d" ] || continue
  c=$(grep -RInE "(express\.json\(.*limit|bodyParser.*limit|client_max_body_size|MAX_CONTENT_LENGTH|MAX_UPLOAD_SIZE|fastify.*bodyLimit|multer.*limits)" "$d" 2>/dev/null | wc -l | tr -d ' ')
  limit_hits=$((limit_hits + c))
done

if [ "$limit_hits" -eq 0 ]; then
  fail "no request-body size limit configured (express.json({limit}), nginx client_max_body_size, multer limits, etc.)"
else
  pass "body-size limit configured ($limit_hits refs)"
fi

# Suspiciously large limit (> 50mb)
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -nE "limit\s*:\s*['\"]?([5-9][0-9]|[1-9][0-9]{2,})mb" "$f" 2>/dev/null | head -3 | grep -q .; then
    warn "$f → very large body limit (>50mb) — confirm legitimate (uploads should use signed S3 directly)"
  fi
done < <(find_files ts tsx js jsx py)

finish
