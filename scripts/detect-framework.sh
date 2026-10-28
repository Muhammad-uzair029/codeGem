#!/usr/bin/env bash
# detect-framework.sh — CLI mirror of frameworkDetection.detectFramework().
#
# Prints one of: REACT_NATIVE_EXPO, NEST_JS, NEXT_JS, FASTAPI, GO, UNKNOWN.
# (GENERIC is a manual pick in the UI and is never detected.)
# Also prints the signals it matched on stderr for debugging.
#
# usage: ./detect-framework.sh /abs/path/to/client

set -euo pipefail

TARGET="${1:-}"
[ -z "$TARGET" ] && { echo "usage: $(basename "$0") /abs/path/to/client" >&2; exit 2; }
[ ! -d "$TARGET" ] && { echo "not a directory: $TARGET" >&2; exit 3; }

pkg="$TARGET/package.json"
signals=()
rn=0
nest=0
next=0
fastapi=0
go=0

if [ -f "$pkg" ]; then
  if grep -qE '"(dependencies|devDependencies|peerDependencies)"\s*:' "$pkg"; then
    if grep -qE '"expo"\s*:' "$pkg"; then signals+=("dependency:expo"); rn=1; fi
    if grep -qE '"react-native"\s*:' "$pkg"; then signals+=("dependency:react-native"); rn=1; fi
    if grep -qE '"@nestjs/core"\s*:' "$pkg"; then signals+=("dependency:@nestjs/core"); nest=1; fi
    if grep -qE '"@nestjs/common"\s*:' "$pkg"; then signals+=("dependency:@nestjs/common"); nest=1; fi
    if grep -qE '"next"\s*:' "$pkg"; then signals+=("dependency:next"); next=1; fi
  fi
fi
[ -f "$TARGET/app.json" ] && grep -q '"expo"' "$TARGET/app.json" 2>/dev/null && { signals+=("file:app.json[expo]"); rn=1; }
[ -f "$TARGET/metro.config.js" ] || [ -f "$TARGET/metro.config.cjs" ] && { signals+=("file:metro.config"); rn=1; }
[ -f "$TARGET/nest-cli.json" ] && { signals+=("file:nest-cli.json"); nest=1; }

# FastAPI declared in pyproject.toml or any requirements*.txt at the root.
for manifest in "$TARGET/pyproject.toml" "$TARGET"/requirements*.txt; do
  [ -f "$manifest" ] || continue
  if grep -qiE '(^|[^A-Za-z0-9_])fastapi([^A-Za-z0-9_]|$)' "$manifest"; then
    signals+=("dependency:fastapi[$(basename "$manifest")]"); fastapi=1
  fi
done
[ -f "$TARGET/go.mod" ] && { signals+=("file:go.mod"); go=1; }

echo "signals: ${signals[*]:-none}" >&2

# RN / Nest keep precedence; both → UNKNOWN. Otherwise exactly one of the
# newer stacks must match.
if [ "$rn" -eq 1 ] && [ "$nest" -eq 0 ]; then
  echo "REACT_NATIVE_EXPO"
elif [ "$nest" -eq 1 ] && [ "$rn" -eq 0 ]; then
  echo "NEST_JS"
elif [ "$rn" -eq 1 ] || [ $((next + fastapi + go)) -ne 1 ]; then
  echo "UNKNOWN"
elif [ "$next" -eq 1 ]; then
  echo "NEXT_JS"
elif [ "$fastapi" -eq 1 ]; then
  echo "FASTAPI"
else
  echo "GO"
fi
