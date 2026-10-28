#!/usr/bin/env bash
# Rule 29 [S]: Input validation at boundaries — zod/joi/yup/pydantic/marshmallow/class-validator.
. "$(dirname "$0")/_lib.sh"
RULE_ID=29; RULE_NAME="Input-validation framework"; RULE_TAGS="S"
header
empty_repo_note

validator_hits=0
for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
  [ -d "$d" ] || continue
  c=$(grep -RInE "(\bzod\b|\bjoi\b|\byup\b|class-validator|pydantic|marshmallow|fastapi.*Body\(|ajv|@hapi/joi)" "$d" 2>/dev/null | wc -l | tr -d ' ')
  validator_hits=$((validator_hits + c))
done

if [ "$validator_hits" -eq 0 ]; then
  fail "no input-validation library found (zod/joi/yup/pydantic/marshmallow/class-validator)"
else
  pass "input-validation library present ($validator_hits refs)"
fi

# Direct use of req.body / request.json() in handler bodies without explicit schema
suspect=0
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -qE "(req\.body|request\.json\(\)|await request\.json)" "$f" 2>/dev/null; then
    if ! grep -qE "(parse\(|safeParse\(|validate\(|schema\.|BaseModel|@Body|Body\()" "$f" 2>/dev/null; then
      case "$f" in
        */routes/*|*/controllers/*|*/handlers/*|*/api/*|*/endpoints/*)
          warn "$f reads request body without visible schema validation"
          suspect=$((suspect + 1))
          ;;
      esac
    fi
  fi
done < <(find_files ts tsx js jsx py)

finish
