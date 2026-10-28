#!/usr/bin/env bash
# Rule 41 [S]: Generic error responses — never echo exception messages, stack traces, or internal
# field names ("s3_key missing", "password too short", "ENOTFOUND db.internal") to clients.
. "$(dirname "$0")/_lib.sh"
RULE_ID=41; RULE_NAME="Generic error responses"; RULE_TAGS="S"
header
empty_repo_note

violations=0
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue

  # JS/TS: res.send/json/status with err.message, err.stack, error.toString, JSON.stringify(error|err)
  if grep -nE "(res|response)\.(send|json|status\([0-9]+\)\.(send|json))\s*\(\s*([a-zA-Z_]*\.(message|stack|toString|name)|\{[^}]*\b(message|stack|error)\b)" "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → response echoes error.message/stack/toString to client"
    violations=$((violations + 1))
  fi
  # JSON.stringify(err) returned
  if grep -nE "res\.(send|json)\s*\(\s*JSON\.stringify\s*\(\s*(err|error|e)\s*\)" "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → JSON.stringify(error) in response body"
    violations=$((violations + 1))
  fi
  # FastAPI: detail=str(e) / detail=repr(e)
  if grep -nE "HTTPException\([^)]*detail\s*=\s*(str|repr)\s*\(\s*e" "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → HTTPException detail=str(e) leaks exception text"
    violations=$((violations + 1))
  fi
  # Flask/Django: traceback.format_exc() into a response
  if grep -nE "traceback\.format_exc\s*\(\s*\)" "$f" 2>/dev/null | head -3 | grep -q .; then
    if grep -qE "(return|jsonify|HttpResponse|JsonResponse).*traceback" "$f" 2>/dev/null; then
      fail "$f → traceback returned in response"
      violations=$((violations + 1))
    else
      warn "$f → traceback.format_exc() — confirm it goes to logger, not response"
    fi
  fi
  # Express default error handler signature echoing message
  if grep -nE "app\.use\s*\(\s*\(?(err|error),\s*req," "$f" 2>/dev/null | head -3 | grep -q .; then
    block=$(grep -A 6 "app\.use\s*\(\s*\(\s*err" "$f" 2>/dev/null)
    if echo "$block" | grep -qE "(res\.(send|json).*err|err\.message|err\.stack)"; then
      fail "$f → Express error middleware echoes err to client"
      violations=$((violations + 1))
    fi
  fi
  # Login-style messages that leak which factor failed
  if grep -nE "[\"'](Password too short|Password is incorrect|User not found|No such user|Email not registered|s3_key missing|Invalid s3 key)[\"']" "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → login/error string leaks which factor failed (use generic 'Invalid credentials')"
    violations=$((violations + 1))
  fi

  # NestJS / Nest exceptions returning raw message
  if grep -nE "throw new (BadRequestException|InternalServerErrorException)\([^)]*\.(message|stack)" "$f" 2>/dev/null | head -3 | grep -q .; then
    fail "$f → Nest exception constructed from raw error.message"
    violations=$((violations + 1))
  fi
done < <(find_files ts tsx js jsx py)

# DEBUG / development flag left enabled
while IFS= read -r f; do
  [ -z "$f" ] || [ ! -f "$f" ] && continue
  if grep -nE "(DEBUG\s*=\s*True|debug\s*:\s*true|app\.debug\s*=\s*True|NODE_ENV\s*=\s*[\"']development[\"'])" "$f" 2>/dev/null | head -3 | grep -q .; then
    warn "$f → DEBUG flag enabled — verify it is off in production builds (Django/Flask debug pages leak full traceback)"
  fi
done < <(find_files ts js py)

[ "$violations" -eq 0 ] && pass "no obvious error-message leaks to client"
finish
