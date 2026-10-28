#!/usr/bin/env bash
# Rule 33 [S]: Mass assignment — spreading req.body into ORM create/update.
. "$(dirname "$0")/_lib.sh"
RULE_ID=33; RULE_NAME="Mass assignment"; RULE_TAGS="S"
header
empty_repo_note

violations=0
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  # JS/TS: prisma/sequelize/typeorm .create/.update({...req.body})
  if grep -nE "\.(create|update|save|insertOne|updateOne)\s*\(\s*\{\s*\.\.\.\s*(req|request)\." "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → spreads req.body straight into ORM call (mass assignment)"
    violations=$((violations + 1))
  fi
  # Python: Model(**request.json()) / Model(**data)
  if grep -nE "Model\(\*\*(request\.json\(\)|body|payload)" "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → splatting request payload into Model() (mass assignment)"
    violations=$((violations + 1))
  fi
done < <(find_files ts tsx js jsx py)

[ "$violations" -eq 0 ] && pass "no obvious mass-assignment sinks detected"
finish
