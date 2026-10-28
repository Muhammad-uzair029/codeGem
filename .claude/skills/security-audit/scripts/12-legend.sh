#!/usr/bin/env bash
# Rule 12: Legend Reference — informational, not a code check.
# S = Security · R = Reliability · O = Operability · A = Architecture · C = Compliance/UX
. "$(dirname "$0")/_lib.sh"
RULE_ID=12; RULE_NAME="Legend Reference"; RULE_TAGS="-"
header
info "Legend: S=Security · R=Reliability · O=Operability · A=Architecture · C=Compliance/UX"
info "This rule is documentation-only; no scan performed."
pass "legend acknowledged"
finish
