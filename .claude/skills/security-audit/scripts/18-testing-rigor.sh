#!/usr/bin/env bash
# Rule 18 [R]: Testing Rigor — Unit, Integration, System test layers required.
. "$(dirname "$0")/_lib.sh"
RULE_ID=18; RULE_NAME="Testing Rigor (unit/integration/system)"; RULE_TAGS="R"
header
empty_repo_note

for layer in unit integration system; do
  hits=$(find "$REPO_ROOT" -type d -name "$layer" 2>/dev/null | grep -E "(__tests__|tests|test|spec)" | head -3)
  any_files=$(find "$REPO_ROOT" -type f \( -name "*${layer}*.test.*" -o -name "*${layer}*.spec.*" -o -name "test_${layer}*.py" \) 2>/dev/null | head -3)
  if [ -z "$hits" ] && [ -z "$any_files" ]; then
    fail "no $layer test files or directories found"
  else
    pass "$layer-tests present"
  fi
done

# Generic test runner config presence
config=0
for f in "$REPO_ROOT"/**/jest.config.* "$REPO_ROOT"/**/vitest.config.* "$REPO_ROOT"/**/pytest.ini "$REPO_ROOT"/**/pyproject.toml; do
  [ -f "$f" ] && config=1
done
[ "$config" -eq 0 ] && warn "no jest/vitest/pytest config file located"

finish
