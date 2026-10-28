#!/usr/bin/env bash
# Rule 01 [S/R/O]: Logging & Monitoring
# Application + endpoint logging must exist. CloudWatch/CloudTrail compatibility expected.
# Downtime email triggers must be wired (SNS / Sentry / health-check alerts).

. "$(dirname "$0")/_lib.sh"
RULE_ID=01; RULE_NAME="Logging & Monitoring"; RULE_TAGS="S/R/O"
header
empty_repo_note

logger_hits=0
for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
  [ -d "$d" ] || continue
  c=$(grep -RInE "(winston|pino|bunyan|logger\.(info|warn|error|debug)|logging\.(info|warning|error|debug)|structlog|loguru|@nestjs/common.*Logger)" "$d" 2>/dev/null | wc -l | tr -d ' ')
  logger_hits=$((logger_hits + c))
done

if [ "$logger_hits" -eq 0 ]; then
  fail "no structured logger usage detected (winston/pino/nest Logger/structlog/loguru). Wire one and emit per-endpoint logs."
else
  pass "structured logger usage detected ($logger_hits sites)"
fi

cw_hits=0
for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
  [ -d "$d" ] || continue
  c=$(grep -RInE "(CloudWatch|cloudwatch|CloudTrail|cloudtrail|aws-sdk.*logs|@aws-sdk/client-cloudwatch)" "$d" 2>/dev/null | wc -l | tr -d ' ')
  cw_hits=$((cw_hits + c))
done
if [ "$cw_hits" -eq 0 ]; then
  warn "no CloudWatch / CloudTrail integration markers found. Confirm log shipping is configured at the infra layer."
else
  pass "CloudWatch/CloudTrail markers present ($cw_hits)"
fi

alert_hits=0
for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
  [ -d "$d" ] || continue
  c=$(grep -RInE "(SNS|sns:Publish|sendDowntimeEmail|healthcheck|/health|/healthz|uptime-?(robot|kuma)|statuscake|pingdom)" "$d" 2>/dev/null | wc -l | tr -d ' ')
  alert_hits=$((alert_hits + c))
done
if [ "$alert_hits" -eq 0 ]; then
  fail "no downtime alerting markers (health endpoint, SNS, uptime monitor) detected."
else
  pass "downtime alert wiring present ($alert_hits markers)"
fi

finish
