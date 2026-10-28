#!/usr/bin/env bash
# run-orval.sh — compile swagger.json into typed TanStack Query hooks
# under apps/frontend-ui/src/api/generated/.
#
# Called by the feature-loop implementer's contract-first sub-step, right
# after gen-swagger.sh succeeds.
#
# On first run, bootstraps a minimal orval.config.ts if the workspace does
# not already have one, so a fresh project can adopt the loop with zero
# manual setup.
#
# On failure, stderr is streamed to build/iter-<N>-orval-stderr.log so the
# verifier can pipe it into the self-healing loop.

set -euo pipefail

ROOT="${FEATURE_LOOP_ROOT:-$(pwd)}"
FRONTEND_WS="apps/frontend-ui"
BACKEND_WS="apps/backend-api"

PROJECT_CACHE="$ROOT/.claude/specs/_project.yaml"
if [ -f "$PROJECT_CACHE" ]; then
  cached_fe="$(awk '/^workspaces:/,/^[^ ]/{ if ($1=="frontend:") { print $2; exit } }' "$PROJECT_CACHE" 2>/dev/null || true)"
  cached_be="$(awk '/^workspaces:/,/^[^ ]/{ if ($1=="backend:") { print $2; exit } }' "$PROJECT_CACHE" 2>/dev/null || true)"
  [ -n "${cached_fe:-}" ] && [ -d "$ROOT/$cached_fe" ] && FRONTEND_WS="$cached_fe"
  [ -n "${cached_be:-}" ] && [ -d "$ROOT/$cached_be" ] && BACKEND_WS="$cached_be"
fi

FRONTEND_DIR="$ROOT/$FRONTEND_WS"
SWAGGER_IN="$ROOT/$BACKEND_WS/dist/swagger.json"
CONFIG_FILE="$FRONTEND_DIR/orval.config.ts"
GEN_ROOT="$FRONTEND_DIR/src/api/generated"

if [ ! -d "$FRONTEND_DIR" ]; then
  echo "run-orval: frontend workspace not found at $FRONTEND_DIR" >&2
  exit 40
fi
if [ ! -f "$SWAGGER_IN" ]; then
  echo "run-orval: no swagger.json at $SWAGGER_IN — run gen-swagger.sh first." >&2
  exit 41
fi

# Bootstrap config on first run.
if [ ! -f "$CONFIG_FILE" ]; then
  echo "run-orval: bootstrapping $CONFIG_FILE"
  cat > "$CONFIG_FILE" <<'EOF'
// Auto-bootstrapped by feature-loop/scripts/run-orval.sh
// Regenerates typed TanStack Query hooks + Axios client from
// apps/backend-api/dist/swagger.json into src/api/generated/.
//
// Do not edit generated files by hand — rerun the loop's implementer
// or `bash .claude/skills/feature-loop/scripts/run-orval.sh` instead.
import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: '../backend-api/dist/swagger.json',
    output: {
      mode: 'tags-split',
      target: './src/api/generated/endpoints.ts',
      schemas: './src/api/generated/schemas',
      client: 'react-query',
      httpClient: 'axios',
      prettier: true,
      override: {
        query: {
          useQuery: true,
          useInfinite: false,
          useMutation: true,
        },
        mutator: {
          path: './src/api/http-client.ts',
          name: 'httpClient',
        },
      },
    },
  },
});
EOF
fi

mkdir -p "$GEN_ROOT"

# Prefer the workspace-scoped runner if pnpm is present; fall back to npx.
if command -v pnpm >/dev/null 2>&1; then
  runner="pnpm --filter ./$FRONTEND_WS exec orval --config ./orval.config.ts"
else
  runner="npx --yes orval --config $CONFIG_FILE"
fi

echo "run-orval: running: $runner"
if ! ( cd "$FRONTEND_DIR" && eval "$runner" ); then
  echo "run-orval: orval failed — see stderr above" >&2
  exit 1
fi

# Post-check: ensure something landed.
if ! find "$GEN_ROOT" -type f -name '*.ts' -print -quit | grep -q .; then
  echo "run-orval: orval ran but no .ts files landed under $GEN_ROOT" >&2
  exit 2
fi

echo "run-orval: regenerated typed hooks under $GEN_ROOT"
