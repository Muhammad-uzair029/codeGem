#!/usr/bin/env bash
# Rule 39 [S/C]: PII redaction in logs — log lines must not echo email/SSN/CC/phone/password.
. "$(dirname "$0")/_lib.sh"
RULE_ID=39; RULE_NAME="PII redaction in logs"; RULE_TAGS="S/C"
header
empty_repo_note

violations=0
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  # logger.X(... user.email ...) / console.log(... password ...)
  if grep -nE "(console\.(log|info|warn|error|debug)|logger\.(info|warn|error|debug)|logging\.(info|warning|error|debug)).*(password|passwd|ssn|social_security|credit_card|card_number|cvv|email)" "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → log statement includes PII / credential field name"
    violations=$((violations + 1))
  fi
  # Stringifying whole user object
  if grep -nE "(console\.(log|info)|logger\.).*JSON\.stringify\s*\(\s*(user|account|customer)\s*\)" "$f" 2>/dev/null | head -3 | grep -q .; then
    warn "$f → logs full user/account JSON — strip PII fields before logging"
  fi
done < <(find_files ts tsx js jsx py)

# Logger config with redaction (pino redact / winston format.redact / structlog processors)
redact_hits=0
for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
  [ -d "$d" ] || continue
  c=$(grep -RInE "(redact\s*:|redact_paths|format\.redact|scrub_pii|sanitize)" "$d" 2>/dev/null | wc -l | tr -d ' ')
  redact_hits=$((redact_hits + c))
done
[ "$redact_hits" -eq 0 ] && warn "no logger-redaction config detected (pino redact / winston redaction / structlog scrubber)"

[ "$violations" -eq 0 ] && pass "no obvious PII-in-log lines detected"
finish
