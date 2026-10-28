#!/usr/bin/env bash
# Rule 25 [S/A]: Container hardening — non-root user, no :latest, no privileged mode.
. "$(dirname "$0")/_lib.sh"
RULE_ID=25; RULE_NAME="Container hardening"; RULE_TAGS="S/A"
header

violations=0
found_docker=0

while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  found_docker=1
  if ! grep -qE "^\s*USER\s+" "$f" 2>/dev/null; then
    fail "$f → no USER directive (runs as root by default)"
    violations=$((violations + 1))
  elif grep -qE "^\s*USER\s+root\s*$" "$f" 2>/dev/null; then
    fail "$f → explicit USER root"
    violations=$((violations + 1))
  fi
  if grep -qE "^\s*FROM\s+[^[:space:]]+:latest\s*$" "$f" 2>/dev/null; then
    fail "$f → FROM uses :latest tag (pin the version)"
    violations=$((violations + 1))
  fi
  if grep -qE "^\s*FROM\s+[a-zA-Z0-9_./-]+\s*$" "$f" 2>/dev/null; then
    warn "$f → FROM has no tag (implicit :latest)"
  fi
  if grep -qE "ADD\s+https?://" "$f" 2>/dev/null; then
    warn "$f → ADD <url> — prefer COPY + verified download"
  fi
done < <(find "$REPO_ROOT" -type f \( -name "Dockerfile" -o -name "Dockerfile.*" \) -not -path "*/node_modules/*" 2>/dev/null)

# docker-compose: privileged / cap_add / network_mode: host
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  found_docker=1
  if grep -qE "^\s*privileged:\s*true" "$f" 2>/dev/null; then
    fail "$f → privileged: true"
    violations=$((violations + 1))
  fi
  if grep -qE "^\s*network_mode:\s*[\"']?host" "$f" 2>/dev/null; then
    fail "$f → network_mode: host (breaks isolation)"
    violations=$((violations + 1))
  fi
  if grep -qE "cap_add:\s*\[?\s*[\"']?SYS_ADMIN" "$f" 2>/dev/null; then
    fail "$f → cap_add: SYS_ADMIN"
    violations=$((violations + 1))
  fi
done < <(find "$REPO_ROOT" -maxdepth 3 -type f \( -name "docker-compose*.yml" -o -name "docker-compose*.yaml" \) 2>/dev/null)

[ "$found_docker" -eq 0 ] && info "no Dockerfile or docker-compose found yet"
[ "$violations" -eq 0 ] && [ "$found_docker" -gt 0 ] && pass "container files pass hardening checks"
finish
