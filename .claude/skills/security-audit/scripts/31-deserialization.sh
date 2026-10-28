#!/usr/bin/env bash
# Rule 31 [S]: Unsafe deserialization — pickle.loads, yaml.load (no safe_load), JSON+eval.
. "$(dirname "$0")/_lib.sh"
RULE_ID=31; RULE_NAME="Unsafe deserialization"; RULE_TAGS="S"
header
empty_repo_note

violations=0
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -nE "(^|[^_])pickle\.(loads?|Unpickler)\s*\(" "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → pickle.loads / pickle.load on potentially untrusted data"
    violations=$((violations + 1))
  fi
  # yaml.load without SafeLoader
  if grep -nE "yaml\.load\s*\(" "$f" 2>/dev/null | grep -vE "(SafeLoader|safe_load|Loader\s*=\s*yaml\.SafeLoader)" | head -3 | grep -q .; then
    fail "$f → yaml.load without SafeLoader (arbitrary code execution risk)"
    violations=$((violations + 1))
  fi
  # eval on parsed JSON
  if grep -nE "eval\s*\(\s*JSON\.parse" "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → eval(JSON.parse(...)) — code injection"
    violations=$((violations + 1))
  fi
  # node serialize / node-serialize
  if grep -nE "require\(['\"]node-serialize['\"]\)|unserialize\s*\(" "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → node-serialize / unserialize() — RCE-known vulnerability surface"
    violations=$((violations + 1))
  fi
done < <(find_files ts tsx js jsx py)

[ "$violations" -eq 0 ] && pass "no unsafe deserialization sinks detected"
finish
