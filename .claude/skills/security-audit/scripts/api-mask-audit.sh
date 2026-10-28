#!/usr/bin/env bash
# API response mask audit — static portion.
#
# Outputs four signal sets the parent agent layers semantic reasoning on:
#   1. Sensitive fields per entity (which columns must never leave the server,
#      which are self-only, which are display-safe).
#   2. Controller response patterns that suggest direct-entity returns
#      (`res.json(entity)`, spread of an entity, etc).
#   3. Service finds: hydration context — every `.find()` / `.findOne()` plus
#      the next 7 lines so the relations: array is visible inline. THIS IS THE
#      LOAD-BEARING SIGNAL: a find() that does NOT hydrate the auth/credential
#      relation cannot leak password / email / role columns no matter what.
#   4. Socket emit payload hints — io.emit() calls. Same over-share risk as
#      HTTP responses, easier to miss.
#
# Usage:
#   bash api-mask-audit.sh
#
# The agent reads this output, walks the listed files, and produces the
# semantic findings table in docs/security/api-mask-audit-YYYY-MM-DD.md.

set -u
. "$(dirname "$0")/_lib.sh"

# Default to the boilerplate's apps/backend-api convention. Override by
# exporting BACKEND_ROOT before running if your layout differs.
BACKEND_ROOT="${BACKEND_ROOT:-$REPO_ROOT/apps/backend-api}"

if [ ! -d "$BACKEND_ROOT" ]; then
  echo "no backend at $BACKEND_ROOT — set BACKEND_ROOT env var to your backend dir, or wait until backend code lands" >&2
  exit 0
fi

# Field name patterns that carry PII / credentials / billing.
# Tuned to common conventions; extend if your project uses non-standard names.
SECRET_FIELDS='password|passwordHash|password_hash|verificationToken|verification_token|accessToken|access_token|refreshToken|refresh_token|sessionToken|session_token|apiKey|api_key|privateKey|private_key'
SELF_ONLY_FIELDS='email|phone|phoneNumber|phone_number|stripeCustomerId|stripe_customer_id|stripeSubscriptionId|stripe_subscription_id|subscriptionStatus|subscription_status|licenseTier|license_tier|organizationId|organization_id|isAdmin|is_admin|isVerified|is_verified|isActive|is_active|isDeleted|is_deleted|dob|dateOfBirth|date_of_birth|address|realName|real_name|ssn|taxId|tax_id'
IDENTIFYING_FIELDS='firstName|first_name|lastName|last_name|middleName|middle_name|fullName|full_name|address|dateOfBirth|date_of_birth'

printf "%s\n" "=== entity fields by sensitivity ==="

# Look for entity-like files: *.entity.ts, *.model.ts, *.schema.ts, prisma schema
ENTITY_GLOBS=("entity.ts" "model.ts" "schema.ts")
for ext in "${ENTITY_GLOBS[@]}"; do
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    rel="${f#$REPO_ROOT/}"
    name=$(basename "$f" ".$ext")

    secrets=$(grep -nE "@Column|@Field|@PrimaryGeneratedColumn|@ManyToOne|@OneToOne|@OneToMany|@ManyToMany|^[[:space:]]*[a-zA-Z_]+[[:space:]]*[:?][[:space:]]" "$f" 2>/dev/null \
      | grep -iE "($SECRET_FIELDS)\b" || true)
    selfonly=$(grep -nE "@Column|@Field|^[[:space:]]*[a-zA-Z_]+[[:space:]]*[:?][[:space:]]" "$f" 2>/dev/null \
      | grep -iE "($SELF_ONLY_FIELDS)\b" || true)
    identifying=$(grep -nE "@Column|@Field|^[[:space:]]*[a-zA-Z_]+[[:space:]]*[:?][[:space:]]" "$f" 2>/dev/null \
      | grep -iE "($IDENTIFYING_FIELDS)\b" || true)

    if [ -n "$secrets$selfonly$identifying" ]; then
      printf "\n--- %s (%s) ---\n" "$name" "$rel"
      [ -n "$secrets" ]     && { printf "  SECRET (must never leave server):\n";   echo "$secrets"     | sed 's/^/    /'; }
      [ -n "$selfonly" ]    && { printf "  SELF-ONLY (only requester themselves):\n"; echo "$selfonly" | sed 's/^/    /'; }
      [ -n "$identifying" ] && { printf "  IDENTIFYING (limit by role/relationship):\n"; echo "$identifying" | sed 's/^/    /'; }
    fi
  done < <(find "$BACKEND_ROOT" -type f -name "*.$ext" 2>/dev/null)
done

# Also scan Prisma schema if present
while IFS= read -r f; do
  [ -f "$f" ] || continue
  rel="${f#$REPO_ROOT/}"
  printf "\n--- prisma schema (%s) ---\n" "$rel"
  grep -nE "^[[:space:]]*[a-zA-Z_]+[[:space:]]+(String|Int|Boolean|DateTime|Json|Bytes)" "$f" 2>/dev/null \
    | grep -iE "($SECRET_FIELDS|$SELF_ONLY_FIELDS|$IDENTIFYING_FIELDS)" \
    | sed 's/^/    /' || echo "    (no sensitive fields detected)"
done < <(find "$BACKEND_ROOT" -type f -name "schema.prisma" 2>/dev/null)

printf "\n\n%s\n" "=== controller response patterns ==="
printf "%s\n" "(flagged = likely-entity returned without an explicit DTO shape)"

# Look for handler-like files in common locations
HANDLER_DIRS=("controllers" "routes" "handlers" "endpoints" "api" "resolvers")
for d in "${HANDLER_DIRS[@]}"; do
  [ -d "$BACKEND_ROOT/$d" ] || continue
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    rel="${f#$REPO_ROOT/}"

    # res.json(singleIdentifier) — bare identifier, likely an entity
    bare=$(grep -nE "(res|reply|ctx|response)\.(json|send)\([[:space:]]*[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*\)" "$f" 2>/dev/null \
      | grep -vE "\.(json|send)\([[:space:]]*(null|undefined|true|false|err|error|message|msg|status|count|total|empty|result)[[:space:]]*\)" \
      || true)

    # res.json({ ...identifier }) — entity spread into response
    spread=$(grep -nE "(res|reply|ctx|response)\.(json|send)\([[:space:]]*\{[^}]*\.\.\." "$f" 2>/dev/null || true)

    # return entity from service-call directly into res.json
    passthrough=$(grep -nE "(res|reply|ctx|response)\.(json|send)\([[:space:]]*await[[:space:]]" "$f" 2>/dev/null || true)

    if [ -n "$bare$spread$passthrough" ]; then
      printf "\n--- %s ---\n" "$rel"
      [ -n "$bare" ]        && { printf "  BARE IDENTIFIER (entity return suspected):\n"; echo "$bare"        | sed 's/^/    /'; }
      [ -n "$spread" ]      && { printf "  SPREAD (entity fields merged into response):\n"; echo "$spread"      | sed 's/^/    /'; }
      [ -n "$passthrough" ] && { printf "  AWAIT PASSTHROUGH (service result sent directly):\n"; echo "$passthrough" | sed 's/^/    /'; }
    fi
  done < <(find "$BACKEND_ROOT/$d" -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" \) 2>/dev/null)
done

printf "\n\n%s\n" "=== service finds: hydration context (relations + select) ==="
cat <<'NOTE'
Each .find() / .findOne() entry below includes the next 7 lines so you can see:
  * which `relations: [...]` are hydrated (these are the ONLY paths that can leak)
  * whether `select: { ... }` is present (constrains columns)

Reading rule: a find() that does NOT hydrate the auth / credential relation
cannot leak `passwordHash` / `email` / `isAdmin` no matter what else is missing.
Don't flag based on missing select alone — check what relations are actually
pulled.
NOTE

SERVICE_DIRS=("services" "service" "data" "dao" "repositories" "repos")
for d in "${SERVICE_DIRS[@]}"; do
  [ -d "$BACKEND_ROOT/$d" ] || continue
  find "$BACKEND_ROOT/$d" -type f \( -name "*.ts" -o -name "*.js" \) 2>/dev/null | while IFS= read -r f; do
    rel="${f#$REPO_ROOT/}"
    awk -v rel="$rel" '
      /\.(find|findOne|findOneBy|findOneOrFail|findAndCount|findMany|findUnique|findFirst)\(/ {
        printf "\n--- %s:%d ---\n", rel, NR
        printf "    %s\n", $0
        for (i = 1; i <= 7 && (getline next_line) > 0; i++) {
          printf "    %s\n", next_line
        }
      }
    ' "$f"
  done | head -200
done

printf "\n\n%s\n" "=== socket emit payload hints ==="
printf "%s\n" "(socket payloads have the same over-sharing risk as HTTP responses)"

socket_emits=$(grep -rnE "(io|socket|server)\.(to\([^)]+\)\.)?emit\(" "$BACKEND_ROOT" 2>/dev/null \
  | grep -vE "(/tests?/|/__tests__/|/node_modules/|/dist/|/build/)" \
  | head -30 || true)
[ -n "$socket_emits" ] && { echo; echo "$socket_emits" | sed 's/^/    /'; }

printf "\n\n%s\n" "=== summary ==="
n_entities=$(find "$BACKEND_ROOT" -type f \( -name "*.entity.ts" -o -name "*.model.ts" -o -name "*.schema.ts" \) 2>/dev/null | wc -l | tr -d ' ')
n_handlers=$(find "$BACKEND_ROOT" -type f -path "*/controllers/*.ts" -o -path "*/routes/*.ts" -o -path "*/handlers/*.ts" 2>/dev/null | wc -l | tr -d ' ')
n_services=$(find "$BACKEND_ROOT" -type f -path "*/services/*.ts" 2>/dev/null | wc -l | tr -d ' ')
printf "entities: %s · handlers: %s · services: %s\n" "$n_entities" "$n_handlers" "$n_services"
printf "\nThis is the STATIC portion. The agent layers semantic reasoning on top:\n"
printf "  * Match each controller response to the service it calls and the entity it returns.\n"
printf "  * Cross-reference with the route file to know who can hit each endpoint.\n"
printf "  * Categorize each endpoint as CLEAN / LEAKING / PARTIAL and assign HIGH / MEDIUM / LOW risk.\n"
printf "  * Write findings to docs/security/api-mask-audit-YYYY-MM-DD.md.\n"
