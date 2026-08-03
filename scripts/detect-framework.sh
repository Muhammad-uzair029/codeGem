#!/usr/bin/env bash
# detect-framework.sh — CLI mirror of projectStateService.detectFramework().
#
# Prints one of: REACT_NATIVE_EXPO, NEST_JS, UNKNOWN.
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

if [ -f "$pkg" ]; then
  if grep -qE '"(dependencies|devDependencies|peerDependencies)"\s*:' "$pkg"; then
    if grep -qE '"expo"\s*:' "$pkg"; then signals+=("dependency:expo"); rn=1; fi
    if grep -qE '"react-native"\s*:' "$pkg"; then signals+=("dependency:react-native"); rn=1; fi
    if grep -qE '"@nestjs/core"\s*:' "$pkg"; then signals+=("dependency:@nestjs/core"); nest=1; fi
    if grep -qE '"@nestjs/common"\s*:' "$pkg"; then signals+=("dependency:@nestjs/common"); nest=1; fi
  fi
fi
[ -f "$TARGET/app.json" ] && grep -q '"expo"' "$TARGET/app.json" 2>/dev/null && { signals+=("file:app.json[expo]"); rn=1; }
[ -f "$TARGET/metro.config.js" ] || [ -f "$TARGET/metro.config.cjs" ] && { signals+=("file:metro.config"); rn=1; }
[ -f "$TARGET/nest-cli.json" ] && { signals+=("file:nest-cli.json"); nest=1; }

echo "signals: ${signals[*]:-none}" >&2

if [ "$rn" -eq 1 ] && [ "$nest" -eq 0 ]; then
  echo "REACT_NATIVE_EXPO"
elif [ "$nest" -eq 1 ] && [ "$rn" -eq 0 ]; then
  echo "NEST_JS"
else
  echo "UNKNOWN"
fi
