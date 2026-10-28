#!/usr/bin/env bash
# Rule 19 [A]: Environment Isolation — staging restricted to office IP allowlist.
. "$(dirname "$0")/_lib.sh"
RULE_ID=19; RULE_NAME="Staging office-network only"; RULE_TAGS="A"
header

# Look for staging configs / terraform with allowlist of IP ranges, or absence thereof
found_staging=0
allowlisted=0
for d in "$REPO_ROOT/infra" "$REPO_ROOT/terraform" "$REPO_ROOT/.github" "$REPO_ROOT/apps"; do
  [ -d "$d" ] || continue
  if grep -qrInE "(stage|staging)" "$d" 2>/dev/null; then
    found_staging=1
  fi
  if grep -qrInE "(office_ip|office_cidr|allowlist|allow_list|ip_whitelist|allowed_ips|cidr_blocks)" "$d" 2>/dev/null; then
    allowlisted=1
  fi
done

if [ "$found_staging" -eq 0 ]; then
  warn "no staging environment configuration detected yet — applies once staging lands"
elif [ "$allowlisted" -eq 0 ]; then
  fail "staging references found but no IP allowlist / office_cidr / whitelist config detected"
else
  pass "staging IP allowlist config present"
fi

finish
