// Stack presets: one entry per TargetFramework. Shared by the renderer
// (stack picker labels) and the main process (CLAUDE.md template lookup).
//
// Keep in sync with:
//   - templates/CLAUDE.md + templates/stacks/*.md (the template files)
//   - scripts/inject-skills.sh                    (CLI template lookup)
//   - scripts/detect-framework.sh                 (CLI detection mirror)
import type { TargetFramework } from './ipc';

export interface StackPreset {
  id: TargetFramework;
  label: string;
  // Path relative to the app's templates/ dir.
  template: string;
}

export const DEFAULT_STACK_TEMPLATE = 'CLAUDE.md';

export const STACK_PRESETS: readonly StackPreset[] = [
  { id: 'REACT_NATIVE_EXPO', label: 'React Native / Expo', template: DEFAULT_STACK_TEMPLATE },
  { id: 'NEST_JS', label: 'NestJS', template: DEFAULT_STACK_TEMPLATE },
  { id: 'NEXT_JS', label: 'Next.js', template: 'stacks/next-js.md' },
  { id: 'FASTAPI', label: 'FastAPI (Python)', template: 'stacks/fastapi.md' },
  { id: 'GO', label: 'Go', template: 'stacks/go.md' },
  { id: 'GENERIC', label: 'Generic (any stack)', template: 'stacks/generic.md' },
];

// Unknown / missing framework falls back to the original RN + Nest template.
export function stackTemplateFor(framework: TargetFramework | null | undefined): string {
  return STACK_PRESETS.find((p) => p.id === framework)?.template ?? DEFAULT_STACK_TEMPLATE;
}
