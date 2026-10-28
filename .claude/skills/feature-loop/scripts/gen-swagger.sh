#!/usr/bin/env bash
# gen-swagger.sh — regenerate apps/backend-api/dist/swagger.json.
#
# Called by the feature-loop implementer's contract-first sub-step.
# On failure, stderr is streamed to build/iter-<N>-swagger-stderr.log so the
# verifier can pipe it into the self-healing loop.
#
# Resolution:
#   1. Read backend workspace path from .claude/specs/_project.yaml (key:
#      workspaces.backend). Fall back to apps/backend-api.
#   2. Prefer `pnpm --filter <ws> swagger` if the script exists. Otherwise
#      `pnpm --filter <ws> build` and locate the generated file.
#   3. Cache the input mtime hash next to swagger.json so re-runs are cheap.

set -euo pipefail

ROOT="${FEATURE_LOOP_ROOT:-$(pwd)}"
BACKEND_WS="apps/backend-api"

PROJECT_CACHE="$ROOT/.claude/specs/_project.yaml"
if [ -f "$PROJECT_CACHE" ]; then
  # Best-effort YAML read without a full parser dep.
  cached_ws="$(awk '/^workspaces:/,/^[^ ]/{ if ($1=="backend:") { print $2; exit } }' "$PROJECT_CACHE" 2>/dev/null || true)"
  if [ -n "${cached_ws:-}" ] && [ -d "$ROOT/$cached_ws" ]; then
    BACKEND_WS="$cached_ws"
  fi
fi

BACKEND_DIR="$ROOT/$BACKEND_WS"
if [ ! -d "$BACKEND_DIR" ]; then
  echo "gen-swagger: backend workspace not found at $BACKEND_DIR" >&2
  exit 40
fi

SWAGGER_OUT="$BACKEND_DIR/dist/swagger.json"
HASH_FILE="$SWAGGER_OUT.build-hash"
mkdir -p "$(dirname "$SWAGGER_OUT")"

# Compute an input hash over sources that can change the OpenAPI shape.
input_hash="$({
  find "$BACKEND_DIR/src" \
    -type f \( -name '*.controller.ts' -o -name '*.dto.ts' -o -name '*.entity.ts' \) \
    -exec shasum -a 256 {} + 2>/dev/null
  [ -d "$BACKEND_DIR/prisma" ] && find "$BACKEND_DIR/prisma" -type f -name '*.prisma' -exec shasum -a 256 {} + 2>/dev/null
} | shasum -a 256 | awk '{print $1}')"

if [ -f "$HASH_FILE" ] && [ -f "$SWAGGER_OUT" ] && [ "$(cat "$HASH_FILE")" = "$input_hash" ]; then
  echo "gen-swagger: no source changes since last successful build — skipping."
  exit 0
fi

# Pick the build target.
build_cmd=""
if [ -f "$BACKEND_DIR/package.json" ]; then
  if grep -q '"swagger"' "$BACKEND_DIR/package.json"; then
    build_cmd="pnpm --filter ./$BACKEND_WS run swagger"
  else
    build_cmd="pnpm --filter ./$BACKEND_WS run build"
  fi
else
  echo "gen-swagger: no package.json in $BACKEND_DIR" >&2
  exit 40
fi

echo "gen-swagger: running: $build_cmd"
if ! eval "$build_cmd"; then
  echo "gen-swagger: build failed — see stderr above" >&2
  exit 1
fi

if [ ! -f "$SWAGGER_OUT" ]; then
  echo "gen-swagger: build succeeded but $SWAGGER_OUT was not produced." >&2
  echo "gen-swagger: ensure the Nest app writes SwaggerModule.setup + writeFileSync to dist/swagger.json." >&2
  exit 2
fi

echo "$input_hash" > "$HASH_FILE"
echo "gen-swagger: wrote $SWAGGER_OUT"
