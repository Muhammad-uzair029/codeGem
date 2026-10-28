#!/usr/bin/env bash
# Rule 03 [C]: Core Pages — Security, About Us, Contact Us placeholders or implementations must exist.
. "$(dirname "$0")/_lib.sh"
RULE_ID=03; RULE_NAME="Core Pages (Security/About/Contact)"; RULE_TAGS="C"
header
empty_repo_note

FRONTEND="$REPO_ROOT/apps/frontend-ui"
if [ ! -d "$FRONTEND" ]; then
  warn "apps/frontend-ui/ not present yet — template state."
  finish
fi

for page in security about contact; do
  hits=$(find "$FRONTEND" -type f \( -name "*.tsx" -o -name "*.jsx" -o -name "*.ts" -o -name "*.js" -o -name "*.vue" -o -name "*.svelte" -o -name "*.html" -o -name "*.md" \) 2>/dev/null | grep -iE "/$page([_-]us)?\.|/$page([_-]us)?/" | head -5)
  if [ -z "$hits" ]; then
    routed=$(grep -RInE "(href|to|path)=[\"']/?$page([_-]us)?[\"']" "$FRONTEND" 2>/dev/null | head -3)
    if [ -z "$routed" ]; then
      fail "no '$page' page or route found under apps/frontend-ui/."
    else
      pass "$page route reference present (no dedicated file yet — placeholder ok)"
    fi
  else
    pass "$page page file present"
  fi
done

finish
