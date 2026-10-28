// Unit tests for the pure feature-loop helpers (worktree slugs, resume flag
// mapping, run status, spec-folder detection, run-list bookkeeping). Runs
// in plain Node via Playwright's runner; no Electron launch.
import { test, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildLoopPrompt,
  findSpecFolder,
  isResumable,
  latestRunFor,
  makeRunSlug,
  recoverCrashedRuns,
  resumeFromSpec,
  reviewInstructions,
  runTimestampSlug,
  slugFromBrief,
  statusFromExit,
  uncommittedOutsideCopies,
  uniqueSlug,
  upsertRunList,
  RUNS_CAP,
} from '../src/main/services/loopHelpers.js';
import type { RunRecord } from '../src/shared/ipc.js';

const run = (patch: Partial<RunRecord>): RunRecord => ({
  id: 'r1',
  targetPath: '/proj',
  cwd: '/proj',
  isolated: false,
  worktreePath: null,
  branch: null,
  baseRef: null,
  startedAt: '2026-10-28T10:00:00.000Z',
  endedAt: null,
  lastStage: 'unknown',
  exitCode: null,
  signal: null,
  status: 'running',
  args: [],
  ...patch,
});

test.describe('slugs', () => {
  const d = new Date(2026, 9, 8, 7, 5, 3);

  test('timestamp slug is zero-padded local time', () => {
    expect(runTimestampSlug(d)).toBe('run-20261008-070503');
  });

  test('brief heading becomes a short kebab prefix', () => {
    expect(slugFromBrief('intro text\n## Add Dark-Mode Toggle!! \nbody')).toBe('add-dark-mode-toggle');
    expect(slugFromBrief('# A really long feature title that keeps going')).toBe('a-really-long-feature-ti');
    expect(slugFromBrief('# ✨ ✨')).toBe('');
    expect(slugFromBrief('no heading here')).toBe('');
    expect(slugFromBrief(null)).toBe('');
  });

  test('makeRunSlug combines prefix and timestamp and is filesystem safe', () => {
    expect(makeRunSlug(d, '# Login / SSO')).toBe('login-sso-run-20261008-070503');
    expect(makeRunSlug(d)).toBe('run-20261008-070503');
    expect(makeRunSlug(d, '# ../../etc')).toMatch(/^[a-z0-9-]+$/);
  });

  test('uniqueSlug appends a counter until free', () => {
    const taken = new Set(['s', 's-2']);
    expect(uniqueSlug('s', (x) => taken.has(x))).toBe('s-3');
    expect(uniqueSlug('free', () => false)).toBe('free');
  });
});

test.describe('status and prompt', () => {
  test('statusFromExit', () => {
    expect(statusFromExit(0, false)).toBe('succeeded');
    expect(statusFromExit(1, false)).toBe('failed');
    expect(statusFromExit(null, false)).toBe('failed');
    expect(statusFromExit(0, true)).toBe('stopped');
    expect(statusFromExit(null, true)).toBe('stopped');
  });

  test('buildLoopPrompt keeps --force-autonomous and appends --from-spec', () => {
    expect(buildLoopPrompt({ forceAutonomous: true })).toBe('/feature-loop --force-autonomous');
    expect(buildLoopPrompt({ forceAutonomous: false })).toBe('/feature-loop');
    expect(buildLoopPrompt({ forceAutonomous: true, fromSpec: 'auth/login' })).toBe(
      '/feature-loop --force-autonomous --from-spec auth/login',
    );
  });

  test('resumeFromSpec only maps implement/verify with a found spec', () => {
    expect(resumeFromSpec('implement', 'auth/login')).toBe('auth/login');
    expect(resumeFromSpec('verify', 'auth/login')).toBe('auth/login');
    expect(resumeFromSpec('verify', null)).toBeNull();
    expect(resumeFromSpec('spec', 'auth/login')).toBeNull();
    expect(resumeFromSpec('brainstorm', 'auth/login')).toBeNull();
    expect(resumeFromSpec('unknown', 'auth/login')).toBeNull();
  });
});

test.describe('findSpecFolder', () => {
  let dir: string;
  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'flm-spec-'));
  });
  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const writeIndex = (rel: string, mtimeSec: number) => {
    const folder = join(dir, '.claude', 'specs', rel);
    mkdirSync(folder, { recursive: true });
    const file = join(folder, 'index.md');
    writeFileSync(file, '# spec\n');
    utimesSync(file, mtimeSec, mtimeSec);
  };

  test('returns null without a specs dir', () => {
    expect(findSpecFolder(dir, 0)).toBeNull();
  });

  test('picks newest index.md after the run started, skipping reserved dirs', () => {
    writeIndex('auth/old', 1000);
    writeIndex('auth/login', 2000);
    writeIndex('billing/invoices', 1500);
    writeIndex('inbox/x', 9000);
    writeIndex('active/x', 9000);
    writeIndex('_archive/x', 9000);
    writeIndex('auth/_draft', 9000);
    expect(findSpecFolder(dir, 1200 * 1000)).toBe('auth/login');
    expect(findSpecFolder(dir, 2500 * 1000)).toBeNull();
  });

  test('ignores feature dirs without index.md', () => {
    mkdirSync(join(dir, '.claude', 'specs', 'auth', 'empty'), { recursive: true });
    expect(findSpecFolder(dir, 0)).toBeNull();
  });
});

test.describe('run list bookkeeping', () => {
  test('upsert replaces by id, sorts newest first, and caps', () => {
    let list: RunRecord[] = [];
    for (let i = 0; i < RUNS_CAP + 5; i++) {
      list = upsertRunList(list, run({ id: `r${i}`, startedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() }));
    }
    expect(list).toHaveLength(RUNS_CAP);
    expect(list[0].id).toBe(`r${RUNS_CAP + 4}`);
    list = upsertRunList(list, { ...list[3], status: 'failed' });
    expect(list).toHaveLength(RUNS_CAP);
    expect(list.filter((r) => r.id === list[3].id)).toHaveLength(1);
    expect(list[3].status).toBe('failed');
  });

  test('recoverCrashedRuns flips running to failed', () => {
    const now = '2026-10-28T12:00:00.000Z';
    const { list, changed } = recoverCrashedRuns(
      [run({ id: 'a' }), run({ id: 'b', status: 'succeeded', endedAt: 'x' })],
      now,
    );
    expect(changed).toBe(true);
    expect(list[0]).toMatchObject({ status: 'failed', endedAt: now });
    expect(list[1]).toMatchObject({ status: 'succeeded', endedAt: 'x' });
    expect(recoverCrashedRuns(list, now).changed).toBe(false);
  });

  test('latestRunFor filters by target and isResumable gates the button', () => {
    const list = [
      run({ id: 'old', startedAt: '2026-10-01T00:00:00Z', status: 'failed' }),
      run({ id: 'new', startedAt: '2026-10-02T00:00:00Z', status: 'stopped' }),
      run({ id: 'other', targetPath: '/else', startedAt: '2026-10-03T00:00:00Z' }),
    ];
    expect(latestRunFor(list, '/proj')?.id).toBe('new');
    expect(latestRunFor(list, '/nope')).toBeNull();
    expect(isResumable(run({ status: 'failed' }))).toBe(true);
    expect(isResumable(run({ status: 'stopped' }))).toBe(true);
    expect(isResumable(run({ status: 'running' }))).toBe(false);
    expect(isResumable(run({ status: 'succeeded' }))).toBe(false);
    expect(isResumable(null)).toBe(false);
  });
});

test.describe('worktree text helpers', () => {
  test('uncommittedOutsideCopies drops copied and generated paths', () => {
    const lines = [
      ' M src/app.ts',
      '?? .claude/specs/inbox/feature-brief.md',
      '?? .claude/specs/auth/login/index.md',
      '?? .claude/skills/feature-loop/SKILL.md',
      '?? CLAUDE.md',
      '?? .mcp.json',
      '?? .claude/feature-loop-run.json',
      '?? notes.txt',
    ];
    expect(uncommittedOutsideCopies(lines, '')).toEqual(['src/app.ts', 'notes.txt']);
    expect(uncommittedOutsideCopies(['?? web/CLAUDE.md', '?? CLAUDE.md'], 'web/')).toEqual(['CLAUDE.md']);
  });

  test('reviewInstructions names the branch, base, and merge command', () => {
    const lines = reviewInstructions({
      targetPath: '/proj',
      worktreePath: '/proj/.claude/worktrees/run-1',
      branch: 'feature-loop/run-1',
      baseRef: 'main',
    }).join('\n');
    expect(lines).toContain('git -C /proj diff main...feature-loop/run-1');
    expect(lines).toContain('git -C /proj merge feature-loop/run-1');
    expect(lines).toContain('/proj/.claude/worktrees/run-1');
    const spaced = reviewInstructions({ targetPath: '/my proj', worktreePath: '/w', branch: 'b', baseRef: 'main' });
    expect(spaced.join('\n')).toContain("git -C '/my proj' diff");
  });
});
