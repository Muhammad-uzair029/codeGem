#!/usr/bin/env bash
# figma-node-fetch.sh — thin wrapper around the Figma REST API used as a
# fallback when the Figma MCP server tool is unavailable in the current
# Claude session.
#
# Called by the feature-loop spec-writer's Figma MCP integration if
# `ToolSearch select:figma:*` returns nothing.
#
# Requires:
#   - FIGMA_TOKEN in the environment (personal access token).
#   - jq for JSON reshaping.
#
# Writes:
#   .claude/specs/<mod>/<feat>/figma/<safe-node-id>.json
#   .claude/specs/<mod>/<feat>/figma/<safe-node-id>.png
#
# The JSON blob is the same shape the MCP tool would return (node tree
# with layout properties). The spec-writer parses it into NativeWind
# classes per the mapping table in agents/spec-writer.md.

set -euo pipefail

usage() {
  cat >&2 <<EOF
usage: figma-node-fetch.sh --file <file_key> --node <node_id> --out <feat_spec_dir>
  --file    Figma file key.
  --node    Figma node id (e.g. 123:456).
  --out     Feature spec dir under .claude/specs/<mod>/<feat>/.

env:
  FIGMA_TOKEN  Personal access token. Required.
EOF
  exit 2
}

FILE_KEY=""; NODE_ID=""; OUT_DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --file) FILE_KEY="$2"; shift 2 ;;
    --node) NODE_ID="$2"; shift 2 ;;
    --out)  OUT_DIR="$2"; shift 2 ;;
    *) usage ;;
  esac
done

[ -z "$FILE_KEY" ] || [ -z "$NODE_ID" ] || [ -z "$OUT_DIR" ] && usage
[ -z "${FIGMA_TOKEN:-}" ] && { echo "figma-node-fetch: FIGMA_TOKEN not set" >&2; exit 3; }
command -v jq >/dev/null 2>&1 || { echo "figma-node-fetch: jq required" >&2; exit 4; }

FIGMA_DIR="$OUT_DIR/figma"
mkdir -p "$FIGMA_DIR"

safe_id="$(echo "$NODE_ID" | tr ':' '_' | tr '/' '_')"

# 1. Node tree with layout properties.
node_url="https://api.figma.com/v1/files/$FILE_KEY/nodes?ids=$NODE_ID&geometry=paths"
node_out="$FIGMA_DIR/$safe_id.json"
echo "figma-node-fetch: GET $node_url"
if ! curl -fsSL -H "X-Figma-Token: $FIGMA_TOKEN" "$node_url" -o "$node_out"; then
  echo "figma-node-fetch: node fetch failed" >&2
  exit 1
fi

# 2. PNG snapshot at 2x.
img_meta_url="https://api.figma.com/v1/images/$FILE_KEY?ids=$NODE_ID&format=png&scale=2"
img_meta="$(curl -fsSL -H "X-Figma-Token: $FIGMA_TOKEN" "$img_meta_url")"
img_url="$(echo "$img_meta" | jq -r --arg id "$NODE_ID" '.images[$id] // empty')"
if [ -z "$img_url" ] || [ "$img_url" = "null" ]; then
  echo "figma-node-fetch: no image url returned for $NODE_ID" >&2
  exit 5
fi
png_out="$FIGMA_DIR/$safe_id.png"
curl -fsSL "$img_url" -o "$png_out"

echo "figma-node-fetch: wrote $node_out and $png_out"
