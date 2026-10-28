#!/usr/bin/env bash
# Rule 10 [C]: Localization — Weglot must be designated for translations.
. "$(dirname "$0")/_lib.sh"
RULE_ID=10; RULE_NAME="Localization (Weglot)"; RULE_TAGS="C"
header
empty_repo_note

FRONTEND="$REPO_ROOT/apps/frontend-ui"
if [ ! -d "$FRONTEND" ]; then
  warn "apps/frontend-ui/ not present — Weglot check deferred."
  finish
fi

weglot=$(grep -RInE "(weglot|Weglot|WEGLOT)" "$FRONTEND" 2>/dev/null | wc -l | tr -d ' ')
if [ "$weglot" -eq 0 ]; then
  fail "Weglot not referenced in apps/frontend-ui/. Add Weglot script tag or SDK init."
else
  pass "Weglot reference(s) present ($weglot)"
fi

# Competing i18n libs may indicate non-policy translation pipeline
competing=$(grep -RInE "(i18next|react-intl|formatjs|@lingui)" "$FRONTEND" 2>/dev/null | wc -l | tr -d ' ')
if [ "$competing" -gt 0 ]; then
  warn "competing i18n library detected ($competing refs) — confirm Weglot is the canonical translator"
fi

finish
