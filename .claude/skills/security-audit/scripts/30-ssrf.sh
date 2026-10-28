#!/usr/bin/env bash
# Rule 30 [S]: SSRF defenses — block private/metadata IPs on user-controlled outbound URLs.
. "$(dirname "$0")/_lib.sh"
RULE_ID=30; RULE_NAME="SSRF defenses"; RULE_TAGS="S"
header
empty_repo_note

violations=0
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  # outbound HTTP call where URL is user-controlled
  if grep -nE "(axios|fetch|requests\.get|httpx\.|urllib\.request|got\(|node-fetch).*(req\.|request\.|body\.|params\.|query\.)" "$f" 2>/dev/null | head -3 | grep -q .; then
    if ! grep -qE "(allowlist|allow_list|whitelist|isPrivateIP|is_private|169\.254\.169\.254|metadata\.google|169\.254|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)" "$f" 2>/dev/null; then
      fail "$f → user-controlled outbound HTTP call without SSRF allowlist / private-IP filter"
      violations=$((violations + 1))
    fi
  fi
done < <(find_files ts tsx js jsx py)

# Hardcoded metadata IP in source (rarely legit)
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -nE "169\.254\.169\.254|metadata\.google\.internal" "$f" 2>/dev/null | head -3 | grep -q .; then
    warn "$f references cloud metadata endpoint — verify intentional"
  fi
done < <(find_files ts tsx js jsx py)

[ "$violations" -eq 0 ] && pass "no obvious SSRF sinks detected"
finish
