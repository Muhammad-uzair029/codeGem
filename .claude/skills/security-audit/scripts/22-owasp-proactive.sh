#!/usr/bin/env bash
# Rule 22 [S]: Proactive Auditing — flag obvious OWASP Top 10 / common omissions.
. "$(dirname "$0")/_lib.sh"
RULE_ID=22; RULE_NAME="Proactive OWASP audit"; RULE_TAGS="S"
header
empty_repo_note

violations=0

# A02 Crypto failures: weak hashes (md5/sha1) on password-ish vars
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -nE "(md5|sha1)\s*\(\s*[a-zA-Z_]*(password|secret|token)" "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → md5/sha1 used on credential material (use bcrypt/argon2/scrypt)"
    violations=$((violations + 1))
  fi
done < <(find_files ts js py)

# A03 Injection: eval / exec
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -nE "(^|[^a-zA-Z_])(eval|exec)\s*\(" "$f" 2>/dev/null | grep -v "node_modules" | head -3 | grep -q .; then
    fail "$f → eval()/exec() usage — code injection risk"
    violations=$((violations + 1))
  fi
done < <(find_files ts js py)

# A05 Misconfig: NODE_TLS_REJECT_UNAUTHORIZED=0, verify=False
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -nE "(NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['\"]?0|rejectUnauthorized\s*:\s*false|verify\s*=\s*False|ssl_verify\s*=\s*False)" "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → TLS verification disabled — MITM risk"
    violations=$((violations + 1))
  fi
done < <(find_files ts js py)

# A07 Auth failures: hardcoded JWT secret
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -nE "(jwt\.sign|jsonwebtoken).*[\"'][a-zA-Z0-9]{6,}[\"']" "$f" 2>/dev/null | grep -vE "(process\.env|os\.environ|config\.)" | head -3 | grep -q .; then
    fail "$f → JWT signed with hardcoded literal — move secret to env/secret manager"
    violations=$((violations + 1))
  fi
done < <(find_files ts js py)

# Secrets in git-tracked .env files (other than .env.example)
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  case "$f" in
    */.env|*/.env.local|*/.env.production)
      if [ -f "$f" ] && grep -qE "[A-Z_]+=[^[:space:]]+" "$f" 2>/dev/null; then
        warn "$f tracked — ensure it's gitignored and not committed (use .env.example for templates)"
      fi
      ;;
  esac
done < <(find "$REPO_ROOT" -maxdepth 5 -type f -name ".env*" 2>/dev/null | grep -v node_modules)

# Security headers (helmet / secure_headers) missing
sec_headers=0
for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
  [ -d "$d" ] || continue
  c=$(grep -RInE "(helmet\(|@nestjs/helmet|secure-headers|secure_headers|SecurityHeadersMiddleware|Content-Security-Policy)" "$d" 2>/dev/null | wc -l | tr -d ' ')
  sec_headers=$((sec_headers + c))
done
if [ "$sec_headers" -eq 0 ]; then
  warn "no security-headers middleware (helmet / CSP) detected"
fi

[ "$violations" -eq 0 ] && pass "no obvious OWASP-class violations detected by heuristic scan"
finish
