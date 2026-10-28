#!/usr/bin/env bash
# Rule 38 [S]: JWT hardening — no alg=none, short access TTL, refresh rotation, secret from env.
. "$(dirname "$0")/_lib.sh"
RULE_ID=38; RULE_NAME="JWT hardening"; RULE_TAGS="S"
header
empty_repo_note

violations=0
jwt_found=0
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -qE "(jsonwebtoken|jwt\.(sign|verify|decode)|PyJWT|jose\.jwt)" "$f" 2>/dev/null; then
    jwt_found=1
    if grep -nE "algorithm[s]?\s*[:=]\s*[\"']none[\"']" "$f" 2>/dev/null | head -3 | grep -q .; then
      fail "$f → alg=none accepted on JWT verify (catastrophic)"
      violations=$((violations + 1))
    fi
    # verify without explicit algorithms list
    if grep -nE "jwt\.verify\(" "$f" 2>/dev/null | head -3 | grep -q .; then
      if ! grep -qE "algorithm[s]?\s*[:=]" "$f" 2>/dev/null; then
        warn "$f → jwt.verify without explicit algorithms list (alg-confusion risk)"
      fi
    fi
    # access-token TTL
    if grep -nE "(expiresIn|exp\s*[:=])\s*[\"']?[0-9]+[dhwmy]" "$f" 2>/dev/null | head -3 | grep -q .; then
      if grep -qE "(expiresIn|exp\s*[:=])\s*[\"']?([3-9][0-9]+d|[1-9][0-9]+d|[1-9]w|[1-9]y)" "$f" 2>/dev/null; then
        warn "$f → JWT TTL looks long (>30d). Use short access-token + refresh rotation."
      fi
    fi
    # Hardcoded secret literal (covered by rule 22 too)
    if grep -nE "jwt\.sign\([^,]+,\s*[\"'][A-Za-z0-9_]{4,}[\"']" "$f" 2>/dev/null | head -3 | grep -q .; then
      fail "$f → JWT signed with hardcoded literal secret"
      violations=$((violations + 1))
    fi
  fi
done < <(find_files ts tsx js jsx py)

[ "$jwt_found" -eq 0 ] && info "no JWT usage detected yet"
[ "$violations" -eq 0 ] && [ "$jwt_found" -gt 0 ] && pass "JWT usage passes hardening checks"
finish
