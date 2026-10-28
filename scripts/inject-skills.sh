#!/usr/bin/env bash
# inject-skills.sh — CLI mirror of skillInjectionService.ts.
#
# Copies the boilerplate's .claude/skills/ matrix into the target client
# project and guarantees the three canonical bundle dirs
# (feature-loop, figma-to-code, quality-assurance) exist. Bootstraps
# .claude/specs/inbox/ + .claude/specs/active/ and writes a strict-mode
# CLAUDE.md if none exists.
#
# usage:
#   ./inject-skills.sh --target /abs/path/to/client [--overwrite]
#       [--framework REACT_NATIVE_EXPO|NEST_JS|NEXT_JS|FASTAPI|GO|GENERIC]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"                # apps/feature-loop-manager
BOILERPLATE_ROOT="$(cd "$APP_DIR/../.." && pwd)"       # repo root
SRC_SKILLS="$BOILERPLATE_ROOT/.claude/skills"
# Standalone checkout: skills are bundled at the app root.
[ -d "$SRC_SKILLS" ] || SRC_SKILLS="$APP_DIR/.claude/skills"

TARGET=""
OVERWRITE=0
FRAMEWORK=""

usage() {
  cat >&2 <<EOF
usage: $(basename "$0") --target /abs/path/to/client [--overwrite]
    [--framework REACT_NATIVE_EXPO|NEST_JS|NEXT_JS|FASTAPI|GO|GENERIC]
  --target      Absolute path to the client project root.
  --overwrite   Replace files that already exist in the target.
  --framework   Stack preset that picks the CLAUDE.md template
                (omit for the React Native / NestJS default).
EOF
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --overwrite) OVERWRITE=1; shift ;;
    --framework) FRAMEWORK="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done

# Mirror of src/shared/stacks.ts STACK_PRESETS.
case "$FRAMEWORK" in
  ""|REACT_NATIVE_EXPO|NEST_JS) TEMPLATE_REL="CLAUDE.md" ;;
  NEXT_JS) TEMPLATE_REL="stacks/next-js.md" ;;
  FASTAPI) TEMPLATE_REL="stacks/fastapi.md" ;;
  GO)      TEMPLATE_REL="stacks/go.md" ;;
  GENERIC) TEMPLATE_REL="stacks/generic.md" ;;
  *) echo "framework must be one of REACT_NATIVE_EXPO, NEST_JS, NEXT_JS, FASTAPI, GO, GENERIC (or omit)" >&2; exit 5 ;;
esac
TEMPLATE_CLAUDE_MD="$APP_DIR/templates/$TEMPLATE_REL"
[ -f "$TEMPLATE_CLAUDE_MD" ] || TEMPLATE_CLAUDE_MD="$APP_DIR/templates/CLAUDE.md"

[ -z "$TARGET" ] && usage
[ ! -d "$TARGET" ] && { echo "target does not exist: $TARGET" >&2; exit 3; }
[ ! -d "$SRC_SKILLS" ] && { echo "boilerplate skills dir missing: $SRC_SKILLS" >&2; exit 4; }

DST_CLAUDE="$TARGET/.claude"
DST_SKILLS="$DST_CLAUDE/skills"
mkdir -p "$DST_SKILLS" "$DST_CLAUDE/specs/inbox" "$DST_CLAUDE/specs/active"

# Copy the whole skills matrix. rsync gives us idempotent copy semantics.
if [ "$OVERWRITE" -eq 1 ]; then
  rsync -a --delete "$SRC_SKILLS/" "$DST_SKILLS/"
else
  rsync -a --ignore-existing "$SRC_SKILLS/" "$DST_SKILLS/"
fi

# Ensure the three canonical dirs exist even if the boilerplate didn't
# ship them yet (e.g. running against an older checkout).
for canonical in feature-loop figma-to-code quality-assurance; do
  mkdir -p "$DST_SKILLS/$canonical"
  if [ ! -f "$DST_SKILLS/$canonical/SKILL.md" ]; then
    case "$canonical" in
      feature-loop)
        cat > "$DST_SKILLS/$canonical/SKILL.md" <<'EOF'
# feature-loop
Canonical entry — see the full SKILL.md shipped by the boilerplate.
EOF
        ;;
      figma-to-code)
        cat > "$DST_SKILLS/$canonical/SKILL.md" <<'EOF'
---
name: figma-to-code
description: Canonical alias for `figma-to-code-skill`. Figma MCP layout translation engine.
---

# figma-to-code

Canonical alias for the boilerplate's Figma → React Native translation skill.
See `../figma-to-code-skill/SKILL.md` for the full playbook.
EOF
        ;;
      quality-assurance)
        cat > "$DST_SKILLS/$canonical/SKILL.md" <<'EOF'
---
name: quality-assurance
description: Self-healing compilation verification engine — composes pre-merge-check, contract-drift-check, and null-safety-scan behind a single entry.
---

# quality-assurance

Composes the Stage 3 compile-gate: `pre-merge-check` (lint + typecheck + tests),
`contract-drift-check` (cross-workspace type drift), and `null-safety-scan`
(null / undef / None on the diff). On FAIL, the feature-loop verifier pipes
the raw stack trace back to the implementer with up to 3 self-healing retries.
See `.claude/skills/feature-loop/agents/verifier.md` § Self-healing loop for
the packet contract.
EOF
        ;;
    esac
  fi
done

# Write CLAUDE.md if missing or overwrite requested.
DST_CLAUDE_MD="$TARGET/CLAUDE.md"
if [ ! -f "$DST_CLAUDE_MD" ] || [ "$OVERWRITE" -eq 1 ]; then
  if [ -f "$TEMPLATE_CLAUDE_MD" ]; then
    cp "$TEMPLATE_CLAUDE_MD" "$DST_CLAUDE_MD"
  else
    cat > "$DST_CLAUDE_MD" <<'EOF'
# Project — orchestrated by claude-code-boilerplate
See .claude/skills/ for the injected skill matrix. Canonical entry points:
- feature-loop
- figma-to-code
- quality-assurance
EOF
  fi
fi

skill_count="$(find "$DST_SKILLS" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
echo "inject-skills: skills=$skill_count target=$TARGET"
