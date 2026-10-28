#!/usr/bin/env bash
# Rule 24 [S/R]: Dependency vulnerability scan via native tooling.
. "$(dirname "$0")/_lib.sh"
RULE_ID=24; RULE_NAME="Dependency vulnerabilities"; RULE_TAGS="S/R"
header

found_any=0

# Node: pnpm/npm audit (prod-only, high+critical)
while IFS= read -r pkg; do
  [ -z "$pkg" ] && continue
  found_any=1
  dir="$(dirname "$pkg")"
  info "scanning $pkg"
  if command -v pnpm >/dev/null 2>&1 && [ -f "$dir/pnpm-lock.yaml" ]; then
    out=$(cd "$dir" && pnpm audit --prod --json 2>/dev/null || true)
    high=$(echo "$out" | grep -oE '"(high|critical)":[[:space:]]*[0-9]+' | awk -F: '{sum+=$2} END{print sum+0}')
  elif command -v npm >/dev/null 2>&1; then
    out=$(cd "$dir" && npm audit --omit=dev --json 2>/dev/null || true)
    high=$(echo "$out" | grep -oE '"(high|critical)":[[:space:]]*[0-9]+' | awk -F: '{sum+=$2} END{print sum+0}')
  else
    warn "no pnpm/npm available to audit $pkg"
    continue
  fi
  if [ "${high:-0}" -gt 0 ]; then
    fail "$pkg → $high high/critical advisory(ies)"
  else
    pass "$pkg → no high/critical advisories"
  fi
done < <(find "$REPO_ROOT" -maxdepth 5 -name package.json -not -path "*/node_modules/*" 2>/dev/null)

# Python: pip-audit if available
while IFS= read -r req; do
  [ -z "$req" ] && continue
  found_any=1
  if command -v pip-audit >/dev/null 2>&1; then
    info "scanning $req with pip-audit"
    if ! pip-audit -r "$req" --strict 2>/dev/null >/dev/null; then
      fail "$req → pip-audit reported vulnerabilities"
    else
      pass "$req → no advisories"
    fi
  else
    warn "pip-audit not installed; skipping $req"
  fi
done < <(find "$REPO_ROOT" -maxdepth 5 \( -name requirements.txt -o -name requirements-prod.txt \) -not -path "*/node_modules/*" 2>/dev/null)

[ "$found_any" -eq 0 ] && info "no package.json or requirements.txt found yet"
finish
