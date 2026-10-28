#!/usr/bin/env bash
# Rule 05 [A]: Network Security — DB must not be publicly exposed.
# Scans IaC + compose files only (skips scripts and CLAUDE.md to avoid self-match).
. "$(dirname "$0")/_lib.sh"
RULE_ID=05; RULE_NAME="Network Security (DB private)"; RULE_TAGS="A"
header
empty_repo_note

violations=0

# Terraform / CloudFormation
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  hits=$(grep -nE "publicly_accessible\s*=\s*true|PubliclyAccessible:\s*true" "$f" 2>/dev/null)
  if [ -n "$hits" ]; then
    while IFS= read -r line; do
      fail "DB publicly accessible in $f → $line"
      violations=$((violations + 1))
    done <<< "$hits"
  fi
done < <(find "$REPO_ROOT/infra" "$REPO_ROOT/terraform" "$REPO_ROOT/cloudformation" -type f \( -name "*.tf" -o -name "*.yml" -o -name "*.yaml" -o -name "*.json" \) 2>/dev/null)

# docker-compose: DB port exposed to 0.0.0.0
for f in "$REPO_ROOT"/docker-compose*.yml "$REPO_ROOT"/docker-compose*.yaml; do
  [ -f "$f" ] || continue
  if grep -qE "^\s*-\s*['\"]?(0\.0\.0\.0:)?(5432|3306|27017|6379):" "$f" 2>/dev/null; then
    warn "$f maps DB port to host — restrict to 127.0.0.1 or a private network for non-dev compose"
  fi
done

# Public-looking DB URLs in env files
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -qE "(postgres|mysql|mongodb)://[^@]+@[a-z0-9.-]+\.(amazonaws\.com|com|net|io)" "$f" 2>/dev/null; then
    case "$f" in
      *.example|*.template) ;;
      *) warn "public-looking DB URL in $f — confirm host is private/VPC-only" ;;
    esac
  fi
done < <(find "$REPO_ROOT" -maxdepth 5 -type f -name ".env*" 2>/dev/null | grep -v -E "(node_modules|\.git/)")

[ "$violations" -eq 0 ] && pass "no DB resources marked publicly_accessible"
finish
