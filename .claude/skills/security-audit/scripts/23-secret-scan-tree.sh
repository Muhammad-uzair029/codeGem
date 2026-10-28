#!/usr/bin/env bash
# Rule 23 [S]: Working-tree secret scan (broader than staged-diff `security-scan` skill).
. "$(dirname "$0")/_lib.sh"
RULE_ID=23; RULE_NAME="Hardcoded secrets in working tree"; RULE_TAGS="S"
header
empty_repo_note

violations=0
# High-confidence patterns
patterns=(
  'AKIA[0-9A-Z]{16}'                       # AWS access key
  'aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{40}'
  'gh[pousr]_[A-Za-z0-9_]{36,}'           # GitHub token
  'github_pat_[A-Za-z0-9_]{82}'
  'xox[abprs]-[A-Za-z0-9-]+'              # Slack token
  'sk_live_[A-Za-z0-9]{24,}'              # Stripe live
  'sk-ant-[A-Za-z0-9-_]{40,}'             # Anthropic
  '-----BEGIN (RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----'
  'eyJ[A-Za-z0-9_=-]{20,}\.eyJ[A-Za-z0-9_=-]{20,}\.[A-Za-z0-9_=-]{10,}'  # JWT literal
  '(postgres|mysql|mongodb)://[^:]+:[^@\s]+@'  # DB URL with creds
)

for pat in "${patterns[@]}"; do
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    fail "secret literal → $hit"
    violations=$((violations + 1))
  done < <(grep -RInE "$pat" \
            "$REPO_ROOT/apps" "$REPO_ROOT/infra" "$REPO_ROOT/terraform" "$REPO_ROOT/.github" 2>/dev/null \
            | grep -v -E "(node_modules|/dist/|/build/|\.lock|\.example|\.template|\.test\.|fixtures/)" \
            | head -3)
done

# High-entropy assignment to secret-named vars
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  hits=$(grep -nE "(secret|token|password|api[_-]?key|apikey)\s*[:=]\s*[\"'][A-Za-z0-9+/=_-]{24,}[\"']" "$f" 2>/dev/null \
         | grep -vE "(process\.env|os\.environ|config\.get|\\\$\\{|EXAMPLE|PLACEHOLDER|xxx|<your)" | head -3)
  if [ -n "$hits" ]; then
    while IFS= read -r h; do
      fail "$f: looks like inline secret → $h"
      violations=$((violations + 1))
    done <<< "$hits"
  fi
done < <(find_files ts tsx js jsx py)

[ "$violations" -eq 0 ] && pass "no high-confidence secret literals in working tree"
finish
