#!/usr/bin/env bash
# Rule 34 [S]: Path traversal — file ops on user-controlled paths without normalization.
. "$(dirname "$0")/_lib.sh"
RULE_ID=34; RULE_NAME="Path traversal"; RULE_TAGS="S"
header
empty_repo_note

violations=0
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  # fs.readFile / fs.createReadStream / open() with req.* parts joined in
  if grep -nE "(fs\.(readFile|createReadStream|writeFile|unlink)|path\.join|open\().*(req\.|request\.|body\.|params\.|query\.)" "$f" 2>/dev/null | head -3 | grep -q .; then
    if ! grep -qE "(path\.normalize|path\.resolve.*startsWith|realpath|sanitize-filename|basename\()" "$f" 2>/dev/null; then
      fail "$f → file op with user-controlled path without normalization/allowlist check"
      violations=$((violations + 1))
    fi
  fi
  # raw '../' literal in user-input string ops
done < <(find_files ts tsx js jsx py)

[ "$violations" -eq 0 ] && pass "no obvious path-traversal sinks detected"
finish
