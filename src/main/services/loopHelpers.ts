import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { LoopStage, RunRecord, RunStatus } from '@shared/ipc';

// Pure helpers for loopService / worktreeService / runStore. No Electron
// imports (and only type imports from @shared) so the Playwright helper
// spec can exercise them without booting the app.

export const RUNS_CAP = 50;
export const WORKTREES_DIR = '.claude/worktrees';
export const RUN_RECORD_FILE = '.claude/feature-loop-run.json';
export const BRANCH_PREFIX = 'feature-loop/';

// Files the loop needs that commonly live outside git. Only copied into
// the worktree when they exist and are untracked or ignored.
export const ISOLATION_COPY_PATHS = [
  '.claude/specs/inbox/feature-brief.md',
  '.claude/skills',
  'CLAUDE.md',
  '.mcp.json',
] as const;

const pad = (n: number): string => String(n).padStart(2, '0');

// `run-YYYYMMDD-HHMMSS` in local time — sortable and filesystem-safe.
export function runTimestampSlug(d: Date): string {
  return (
    `run-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

// First markdown heading → lowercase kebab, capped so branch names stay
// short. Returns '' when the brief has no usable heading.
export function slugFromBrief(markdown: string | null | undefined, maxLen = 24): string {
  if (!markdown) return '';
  const heading = markdown.split(/\r?\n/).find((l) => /^#{1,6}\s+\S/.test(l));
  if (!heading) return '';
  const slug = heading
    .replace(/^#{1,6}\s+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, maxLen).replace(/-+$/g, '');
}

export function makeRunSlug(d: Date, briefMarkdown?: string | null): string {
  const prefix = slugFromBrief(briefMarkdown);
  const ts = runTimestampSlug(d);
  return prefix ? `${prefix}-${ts}` : ts;
}

// Appends -2, -3, … until `taken` says the slug is free.
export function uniqueSlug(base: string, taken: (slug: string) => boolean, maxTries = 100): string {
  if (!taken(base)) return base;
  for (let i = 2; i <= maxTries; i++) {
    const candidate = `${base}-${i}`;
    if (!taken(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export function statusFromExit(code: number | null, stopRequested: boolean): RunStatus {
  if (stopRequested) return 'stopped';
  return code === 0 ? 'succeeded' : 'failed';
}

// The body of the `-p` prompt. Flags belong to the slash command, so they
// are appended to the prompt string rather than passed as CLI args.
export function buildLoopPrompt(opts: { forceAutonomous: boolean; fromSpec?: string | null }): string {
  let prompt = '/feature-loop';
  if (opts.forceAutonomous) prompt += ' --force-autonomous';
  if (opts.fromSpec) prompt += ` --from-spec ${opts.fromSpec}`;
  return prompt;
}

// Stages past spec-writing can skip straight to stage 2 with the spec on
// disk. Anything earlier re-runs plain /feature-loop, which resumes itself.
export function stageWantsSpec(stage: LoopStage): boolean {
  return stage === 'implement' || stage === 'verify';
}

export function resumeFromSpec(stage: LoopStage, specFolder: string | null): string | null {
  return stageWantsSpec(stage) && specFolder ? specFolder : null;
}

const SKIP_SPEC_DIRS = new Set(['inbox', 'active']);
const isSpecDir = (name: string): boolean => !SKIP_SPEC_DIRS.has(name) && !name.startsWith('_') && !name.startsWith('.');

// Newest `<cwd>/.claude/specs/<mod>/<feat>/index.md` modified at or after
// `sinceMs`. Returns `<mod>/<feat>` or null.
export function findSpecFolder(cwd: string, sinceMs: number): string | null {
  const root = join(cwd, '.claude', 'specs');
  if (!existsSync(root)) return null;
  let best: { rel: string; mtime: number } | null = null;
  const subdirs = (dir: string): string[] => {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && isSpecDir(d.name))
        .map((d) => d.name);
    } catch {
      return [];
    }
  };
  for (const mod of subdirs(root)) {
    for (const feat of subdirs(join(root, mod))) {
      const index = join(root, mod, feat, 'index.md');
      try {
        const mtime = statSync(index).mtimeMs;
        if (mtime >= sinceMs && (!best || mtime > best.mtime)) best = { rel: `${mod}/${feat}`, mtime };
      } catch {
        /* no index.md */
      }
    }
  }
  return best?.rel ?? null;
}

// Newest-first, capped. Replaces any record with the same id.
export function upsertRunList(list: RunRecord[], rec: RunRecord, cap = RUNS_CAP): RunRecord[] {
  const rest = list.filter((r) => r.id !== rec.id);
  return [rec, ...rest]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, cap);
}

// Records still `running` at startup belong to a crashed app session.
export function recoverCrashedRuns(list: RunRecord[], nowIso: string): { list: RunRecord[]; changed: boolean } {
  let changed = false;
  const next = list.map((r) => {
    if (r.status !== 'running') return r;
    changed = true;
    return { ...r, status: 'failed' as const, endedAt: r.endedAt ?? nowIso };
  });
  return { list: next, changed };
}

export function latestRunFor(list: RunRecord[], targetPath: string): RunRecord | null {
  let best: RunRecord | null = null;
  for (const r of list) {
    if (r.targetPath !== targetPath) continue;
    if (!best || Date.parse(r.startedAt) > Date.parse(best.startedAt)) best = r;
  }
  return best;
}

export function isResumable(run: RunRecord | null | undefined): boolean {
  return !!run && (run.status === 'failed' || run.status === 'stopped');
}

// `git status --porcelain` lines (paths relative to the repo root) minus
// the paths isolation copies over or creates itself. What remains is work
// the isolated run will not see.
export function uncommittedOutsideCopies(porcelainLines: string[], repoPrefix: string): string[] {
  const skip = [...ISOLATION_COPY_PATHS, WORKTREES_DIR, RUN_RECORD_FILE].map((p) => repoPrefix + p);
  return porcelainLines
    .filter((l) => l.length > 3)
    .map((l) => l.slice(3))
    .filter((p) => !skip.some((s) => p === s || p.startsWith(s + '/') || (p.endsWith('/') && s.startsWith(p))));
}

export function reviewInstructions(opts: {
  targetPath: string;
  worktreePath: string;
  branch: string;
  baseRef: string;
}): string[] {
  const q = (s: string): string => (/^[\w./@:-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
  const git = `git -C ${q(opts.targetPath)}`;
  return [
    `worktree: ${opts.worktreePath}`,
    `branch:   ${opts.branch} (from ${opts.baseRef})`,
    `review:   ${git} diff ${opts.baseRef}...${opts.branch}`,
    `merge:    ${git} merge ${opts.branch}`,
    `cleanup:  ${git} worktree remove ${q(opts.worktreePath)}  (after merging)`,
  ];
}
