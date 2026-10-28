#!/usr/bin/env bash
# Rule 08 [S]: IP Obfuscation — origin/infra IPs must not be exposed to clients.
. "$(dirname "$0")/_lib.sh"
RULE_ID=08; RULE_NAME="IP Obfuscation"; RULE_TAGS="S"
header
empty_repo_note

violations=0
# Look for hard-coded public IPv4 in client code, docs, or any HTML/JSON response templates
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  hits=$(grep -nEo "\b(([0-9]{1,3}\.){3}[0-9]{1,3})\b" "$f" 2>/dev/null \
    | grep -vE "(^[^:]+:[0-9]+:)(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|0\.0\.0\.0|255\.255\.|169\.254\.|224\.|239\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)" \
    | head -5)
  if [ -n "$hits" ]; then
    case "$f" in
      */frontend-ui/*|*/public/*|*/static/*|*.md)
        while IFS= read -r h; do
          fail "$f → public IP literal in client-visible file: $h"
          violations=$((violations + 1))
        done <<< "$hits"
        ;;
      *)
        while IFS= read -r h; do
          warn "$f → public IP literal: $h (server-side; confirm not echoed to clients)"
        done <<< "$hits"
        ;;
    esac
  fi
done < <(find "$REPO_ROOT" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.py" -o -name "*.html" -o -name "*.json" -o -name "*.md" \) 2>/dev/null | grep -v -E "(node_modules|\.git/|dist/|build/)")

# Headers that may leak server identity
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -qE "(X-Powered-By|Server\s*:|X-Backend-Server)" "$f" 2>/dev/null; then
    warn "$f references identifying header (X-Powered-By/Server) — strip in prod responses"
  fi
done < <(find_files ts js py)

[ "$violations" -eq 0 ] && pass "no public-IP leaks to client surfaces detected"
finish
