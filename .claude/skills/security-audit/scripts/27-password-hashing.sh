#!/usr/bin/env bash
# Rule 27 [S]: Password hashing — bcrypt/argon2/scrypt only. Reject md5/sha-* on passwords.
. "$(dirname "$0")/_lib.sh"
RULE_ID=27; RULE_NAME="Password hashing strength"; RULE_TAGS="S"
header
empty_repo_note

violations=0
modern_hits=0
for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
  [ -d "$d" ] || continue
  c=$(grep -RInE "(bcrypt|argon2|scrypt|passlib|werkzeug\.security\.generate_password_hash)" "$d" 2>/dev/null | wc -l | tr -d ' ')
  modern_hits=$((modern_hits + c))
done

while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  # md5/sha1/sha256 used on a password-like variable
  if grep -nE "(md5|sha1|sha224|sha256|sha384|sha512)\s*\(\s*[a-zA-Z_]*(password|passwd|pwd)" "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → cryptographic hash used on password (use bcrypt/argon2/scrypt)"
    violations=$((violations + 1))
  fi
  # bcrypt rounds < 10
  if grep -nE "bcrypt\.(hash|hashSync|genSalt)\s*\([^,]*,\s*[0-9]" "$f" 2>/dev/null | grep -oE ",\s*[0-9]+" | awk -F',' '{gsub(" ","",$2); if($2+0 < 10) exit 0; else exit 1}'; then
    warn "$f → bcrypt rounds appear to be < 10 (use 12+)"
  fi
done < <(find_files ts tsx js jsx py)

if [ "$modern_hits" -eq 0 ]; then
  warn "no bcrypt/argon2/scrypt usage detected yet — applies once auth lands"
else
  pass "modern password hashing library present ($modern_hits refs)"
fi
[ "$violations" -eq 0 ] && pass "no weak hash on password material"
finish
