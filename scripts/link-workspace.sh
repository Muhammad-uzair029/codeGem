#!/usr/bin/env bash
# link-workspace.sh — workspace linking hook.
#
# Registers the given client project in the manager's persistent config
# and writes a symlink into the app's userData/workspaces/ dir so the UI
# can quick-switch between managed projects without re-picking the
# directory each time.
#
# usage:
#   ./link-workspace.sh --target /abs/path/to/client \
#       --project-type NEW_SCAFFOLD|EXISTING_LEGACY \
#       [--framework REACT_NATIVE_EXPO|NEST_JS|NEXT_JS|FASTAPI|GO|GENERIC]

set -euo pipefail

TARGET=""
PROJECT_TYPE=""
FRAMEWORK=""

usage() {
  cat >&2 <<EOF
usage: $(basename "$0") --target /abs/path/to/client \\
    --project-type NEW_SCAFFOLD|EXISTING_LEGACY \\
    [--framework REACT_NATIVE_EXPO|NEST_JS|NEXT_JS|FASTAPI|GO|GENERIC]
EOF
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --project-type) PROJECT_TYPE="$2"; shift 2 ;;
    --framework) FRAMEWORK="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done

[ -z "$TARGET" ] && usage
[ ! -d "$TARGET" ] && { echo "target does not exist: $TARGET" >&2; exit 3; }
case "$PROJECT_TYPE" in
  NEW_SCAFFOLD|EXISTING_LEGACY) ;;
  *) echo "project-type must be NEW_SCAFFOLD or EXISTING_LEGACY" >&2; exit 4 ;;
esac
if [ -n "$FRAMEWORK" ]; then
  case "$FRAMEWORK" in
    REACT_NATIVE_EXPO|NEST_JS|NEXT_JS|FASTAPI|GO|GENERIC) ;;
    *) echo "framework must be one of REACT_NATIVE_EXPO, NEST_JS, NEXT_JS, FASTAPI, GO, GENERIC (or omit)" >&2; exit 5 ;;
  esac
fi

# Resolve the manager's userData dir. Electron stores it under
# ~/Library/Application Support/feature-loop-manager on macOS,
# ~/.config/feature-loop-manager on Linux, %APPDATA%/feature-loop-manager
# on Windows. Handled here without launching Electron.
case "$(uname -s)" in
  Darwin)  BASE="$HOME/Library/Application Support" ;;
  Linux)   BASE="${XDG_CONFIG_HOME:-$HOME/.config}" ;;
  MINGW*|MSYS*|CYGWIN*) BASE="${APPDATA:-$HOME/AppData/Roaming}" ;;
  *)       BASE="$HOME" ;;
esac
USER_DATA="$BASE/feature-loop-manager"
mkdir -p "$USER_DATA/workspaces"

# Sanitize the project name for the symlink filename.
project_slug="$(basename "$TARGET" | tr -c 'A-Za-z0-9._-' '-' | sed 's/-\{2,\}/-/g' | sed 's/^-//;s/-$//')"
link="$USER_DATA/workspaces/$project_slug"

ln -snf "$TARGET" "$link"

# Merge the entry into config.json. Use python3 for a portable in-place
# JSON edit — falls back to a manual write if python3 is unavailable.
config="$USER_DATA/config.json"
if command -v python3 >/dev/null 2>&1; then
  python3 - "$config" "$TARGET" "$PROJECT_TYPE" "$FRAMEWORK" <<'PY'
import json, os, sys
from datetime import datetime, timezone

path, target, project_type, framework = sys.argv[1:5]
framework = framework or None

cfg = {}
if os.path.exists(path):
    try:
        cfg = json.load(open(path))
    except Exception:
        cfg = {}
history = cfg.get('history') or []
history = [h for h in history if h.get('active_project_path') != target]
history.insert(0, {
    'active_project_path': target,
    'project_type': project_type,
    'target_framework': framework,
    'last_used_at': datetime.now(timezone.utc).isoformat(),
})
history = history[:24]
cfg.update({
    'active_project_path': target,
    'project_type': project_type,
    'target_framework': framework,
    'history': history,
})
with open(path, 'w') as f:
    json.dump(cfg, f, indent=2)
    f.write('\n')
PY
else
  cat > "$config" <<EOF
{
  "active_project_path": "$TARGET",
  "project_type": "$PROJECT_TYPE",
  "target_framework": ${FRAMEWORK:+\"$FRAMEWORK\"}${FRAMEWORK:-null},
  "history": []
}
EOF
fi

echo "link-workspace: linked $TARGET as $project_slug in $USER_DATA"
