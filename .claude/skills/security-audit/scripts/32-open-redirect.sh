#!/usr/bin/env bash
# Rule 32 [S]: Open redirect — redirect() with user-controlled URL must validate allowlist.
. "$(dirname "$0")/_lib.sh"
RULE_ID=32; RULE_NAME="Open redirect"; RULE_TAGS="S"
header
empty_repo_note

violations=0
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  # res.redirect(req.query.next) style
  if grep -nE "(res\.redirect|response\.redirect|RedirectResponse).*(req\.|request\.|body\.|params\.|query\.)" "$f" 2>/dev/null | head -3 | grep -q .; then
    if ! grep -qE "(allowlist|whitelist|startsWith\(['\"]/|^/[a-z]|isSafeUrl|validate_redirect|urlparse)" "$f" 2>/dev/null; then
      fail "$f → redirect with user-controlled URL and no allowlist / relative-path check"
      violations=$((violations + 1))
    fi
  fi
done < <(find_files ts tsx js jsx py)

[ "$violations" -eq 0 ] && pass "no obvious open-redirect sinks detected"
finish
