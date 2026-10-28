#!/usr/bin/env bash
# Rule 07 [A/S]: Cloud Storage — S3 presigned URLs with TTL ≤ 300 seconds (5 min).
. "$(dirname "$0")/_lib.sh"
RULE_ID=07; RULE_NAME="Cloud Storage (S3 presigned TTL ≤ 5m)"; RULE_TAGS="A/S"
header
empty_repo_note

violations=0
found_presign=0
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -qE "(getSignedUrl|generate_presigned_url|createPresignedPost|@aws-sdk/s3-request-presigner)" "$f" 2>/dev/null; then
    found_presign=1
    # Inspect expires-in numeric literal nearby (rough)
    bad=$(grep -nE "(Expires|expiresIn|ExpiresIn|expires_in)\s*[:=]\s*([0-9]+)" "$f" 2>/dev/null | awk -F: '
      {
        val=$0; line=$2;
        match(val, /[0-9]+[[:space:]]*$/, m);
        if (m[0] > 300) print line": "$0;
      }')
    if [ -n "$bad" ]; then
      while IFS= read -r b; do
        fail "$f → presigned URL TTL > 300s: $b"
        violations=$((violations + 1))
      done <<< "$bad"
    fi
  fi

  # Hard-coded raw S3 public URLs (no presign)
  if grep -qE "https?://[a-z0-9.-]+\.s3[.-][a-z0-9.-]+\.amazonaws\.com/" "$f" 2>/dev/null; then
    if ! grep -qE "(getSignedUrl|generate_presigned_url|presigned)" "$f" 2>/dev/null; then
      warn "$f contains raw s3.amazonaws.com URL — verify it's not bypassing presign flow"
    fi
  fi
done < <(find_files ts tsx js py)

if [ "$found_presign" -eq 0 ]; then
  info "no S3 presigned-URL usage found — rule applies once S3 integration lands"
fi
[ "$violations" -eq 0 ] && pass "no S3 presigned-URL TTL violations"
finish
