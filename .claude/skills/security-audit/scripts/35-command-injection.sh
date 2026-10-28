#!/usr/bin/env bash
# Rule 35 [S]: Command injection — exec/spawn/shell=True with user input.
. "$(dirname "$0")/_lib.sh"
RULE_ID=35; RULE_NAME="Command injection"; RULE_TAGS="S"
header
empty_repo_note

violations=0
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  # child_process.exec / execSync with template literal / concatenation containing req.*
  if grep -nE "(exec|execSync|spawnSync)\s*\(\s*[\"\`].*\$\{?[a-zA-Z_]*(req|request|body|params|query)" "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → child_process.exec with interpolated user input"
    violations=$((violations + 1))
  fi
  # Python: subprocess with shell=True
  if grep -nE "subprocess\.(run|call|Popen|check_output)\([^)]*shell\s*=\s*True" "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → subprocess shell=True (command injection surface)"
    violations=$((violations + 1))
  fi
  # os.system / os.popen
  if grep -nE "\bos\.(system|popen)\s*\(" "$f" 2>/dev/null | head -3 | grep -q .; then
    warn "$f → os.system / os.popen — prefer subprocess with shell=False"
  fi
done < <(find_files ts tsx js jsx py)

[ "$violations" -eq 0 ] && pass "no obvious command-injection sinks detected"
finish
