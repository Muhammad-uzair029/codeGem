#!/usr/bin/env bash
# Rule 40 [S/A]: Encryption at rest — DB storage_encrypted, S3 SSE, EBS encryption.
. "$(dirname "$0")/_lib.sh"
RULE_ID=40; RULE_NAME="Encryption at rest"; RULE_TAGS="S/A"
header

found_iac=0
violations=0
for d in "$REPO_ROOT/infra" "$REPO_ROOT/terraform" "$REPO_ROOT/cloudformation"; do
  [ -d "$d" ] || continue
  found_iac=1
  while IFS= read -r f; do
    [ -z "$f" ] || [ ! -f "$f" ] && continue

    # aws_db_instance / aws_rds_cluster — needs storage_encrypted = true
    if grep -qE "resource\s+\"aws_(db_instance|rds_cluster)\"" "$f" 2>/dev/null; then
      if ! grep -qE "storage_encrypted\s*=\s*true" "$f" 2>/dev/null; then
        fail "$f → RDS resource without storage_encrypted = true"
        violations=$((violations + 1))
      fi
    fi
    # aws_s3_bucket — SSE config
    if grep -qE "resource\s+\"aws_s3_bucket\"\s+" "$f" 2>/dev/null; then
      if ! grep -qE "(server_side_encryption_configuration|aws_s3_bucket_server_side_encryption_configuration)" "$f" 2>/dev/null; then
        fail "$f → S3 bucket without server-side encryption configured"
        violations=$((violations + 1))
      fi
    fi
    # aws_ebs_volume — encrypted = true
    if grep -qE "resource\s+\"aws_ebs_volume\"" "$f" 2>/dev/null; then
      if ! grep -qE "encrypted\s*=\s*true" "$f" 2>/dev/null; then
        fail "$f → EBS volume without encrypted = true"
        violations=$((violations + 1))
      fi
    fi
  done < <(find "$d" -type f \( -name "*.tf" -o -name "*.yml" -o -name "*.yaml" -o -name "*.json" \) 2>/dev/null)
done

[ "$found_iac" -eq 0 ] && info "no terraform/cloudformation found yet"
[ "$violations" -eq 0 ] && [ "$found_iac" -gt 0 ] && pass "IaC resources opt into encryption at rest"
finish
