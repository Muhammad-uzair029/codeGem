#!/usr/bin/env bash
# Rule 20 [S]: Browser Security — strict CORS, no '*' in prod.
. "$(dirname "$0")/_lib.sh"
RULE_ID=20; RULE_NAME="CORS strictness"; RULE_TAGS="S"
header
empty_repo_note

violations=0
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  # Wildcard origin
  if grep -nE "(Access-Control-Allow-Origin[\"']?\s*[:,]\s*[\"']\*[\"']|origin\s*[:=]\s*[\"']\*[\"']|allow_origins\s*=\s*\[\s*[\"']\*[\"']\])" "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → CORS wildcard origin '*' — restrict to explicit origins in production"
    violations=$((violations + 1))
  fi
  # cors() with no args (defaults to *)
  if grep -nE "\bcors\(\)\s*[);]" "$f" 2>/dev/null | head -3 | grep -q .; then
    warn "$f → cors() called with no options (default allows any origin)"
  fi
done < <(find_files ts js py)

[ "$violations" -eq 0 ] && pass "no wildcard CORS origins detected"
finish
