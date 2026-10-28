#!/usr/bin/env bash
# Rule 16 [S/A]: Edge Security — Cloudflare proxying mandated for public web routes.
. "$(dirname "$0")/_lib.sh"
RULE_ID=16; RULE_NAME="Cloudflare proxy mandate"; RULE_TAGS="S/A"
header
empty_repo_note

cf_hits=0
for d in "$REPO_ROOT/infra" "$REPO_ROOT/terraform" "$REPO_ROOT/.github" "$REPO_ROOT/apps"; do
  [ -d "$d" ] || continue
  c=$(grep -RInE "(cloudflare|CF-Connecting-IP|cf-ray|cloudflare/wrangler|@cloudflare/|cloudflare_record|proxied\s*=\s*true)" "$d" 2>/dev/null | wc -l | tr -d ' ')
  cf_hits=$((cf_hits + c))
done

if [ "$cf_hits" -eq 0 ]; then
  fail "no Cloudflare references (config/proxy/headers). All public web routes must sit behind Cloudflare."
else
  pass "Cloudflare references present ($cf_hits)"
fi

# Terraform: cloudflare_record proxied=false is wrong for public routes
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -qE "proxied\s*=\s*false" "$f" 2>/dev/null; then
    warn "$f sets proxied=false on cloudflare record — verify route is internal-only"
  fi
done < <(find "$REPO_ROOT/infra" "$REPO_ROOT/terraform" -type f -name "*.tf" 2>/dev/null)

finish
