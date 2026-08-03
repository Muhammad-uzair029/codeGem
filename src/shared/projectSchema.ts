// Canonical client-side directory blueprint the orchestrator enforces
// on every target project.
//
// Keep in sync with:
//   - src/main/services/skillInjectionService.ts (writes these dirs)
//   - scripts/inject-skills.sh                   (CLI mirror)
//   - README.md § "Client-side .claude/ blueprint"
export const CLIENT_CLAUDE_BLUEPRINT = {
  root: '.claude',
  files: {
    claudeMd: 'CLAUDE.md',
  },
  dirs: {
    specs: {
      root: '.claude/specs',
      inbox: '.claude/specs/inbox',
      active: '.claude/specs/active',
    },
    skills: {
      root: '.claude/skills',
      canonical: ['feature-loop', 'figma-to-code', 'quality-assurance'] as const,
    },
  },
} as const;

export type CanonicalSkill = (typeof CLIENT_CLAUDE_BLUEPRINT.dirs.skills.canonical)[number];
export const BRIEF_FILENAME = 'feature-brief.md';
