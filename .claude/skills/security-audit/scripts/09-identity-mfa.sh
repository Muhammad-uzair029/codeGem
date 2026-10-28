#!/usr/bin/env bash
# Rule 09 [S/C]: Identity Protection — MFA for client + admin accounts.
. "$(dirname "$0")/_lib.sh"
RULE_ID=09; RULE_NAME="MFA (client + admin)"; RULE_TAGS="S/C"
header
empty_repo_note

mfa_hits=0
for d in "${SCAN_ROOTS_DEFAULT[@]}"; do
  [ -d "$d" ] || continue
  c=$(grep -RInE "(otplib|speakeasy|pyotp|@simplewebauthn|webauthn|2fa|two-?factor|mfa|totp|cognito.*MFA|auth0.*mfa)" "$d" 2>/dev/null | wc -l | tr -d ' ')
  mfa_hits=$((mfa_hits + c))
done

if [ "$mfa_hits" -eq 0 ]; then
  fail "no MFA/TOTP/WebAuthn integration markers found. Enforce MFA on login (esp. admin)."
else
  pass "MFA markers present ($mfa_hits)"
fi

# Admin login path that bypasses MFA
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -qE "(admin.*login|loginAdmin|adminLogin)" "$f" 2>/dev/null; then
    if ! grep -qE "(mfa|totp|otp|2fa|webauthn)" "$f" 2>/dev/null; then
      fail "$f has admin login path without MFA verification"
    fi
  fi
done < <(find_files ts js py)

finish
