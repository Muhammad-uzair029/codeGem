import { spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { IsolationInfo } from '@shared/ipc';
import {
  BRANCH_PREFIX,
  ISOLATION_COPY_PATHS,
  RUN_RECORD_FILE,
  WORKTREES_DIR,
  makeRunSlug,
  uncommittedOutsideCopies,
  uniqueSlug,
} from './loopHelpers.js';

// Git worktree isolation for feature-loop runs. Each run gets its own
// branch + checkout under <target>/.claude/worktrees/<slug> so the user
// can keep editing their working folder. No Electron imports, so the
// manual verification script can drive it directly.

interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

function git(cwd: string, args: string[]): GitResult {
  try {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return { ok: r.status === 0, stdout: r.stdout ?? '', stderr: (r.stderr ?? '').trim() || (r.error?.message ?? '') };
  } catch (err) {
    return { ok: false, stdout: '', stderr: err instanceof Error ? err.message : String(err) };
  }
}

// Idempotently adds `pattern` as its own line in <common-dir>/info/exclude.
function ensureExcluded(targetPath: string, pattern: string): void {
  const common = git(targetPath, ['rev-parse', '--git-common-dir']);
  if (!common.ok) return;
  const raw = common.stdout.trim();
  const commonDir = isAbsolute(raw) ? raw : resolve(targetPath, raw);
  const excludeFile = join(commonDir, 'info', 'exclude');
  const current = existsSync(excludeFile) ? readFileSync(excludeFile, 'utf8') : '';
  if (current.split(/\r?\n/).some((l) => l.trim() === pattern)) return;
  mkdirSync(dirname(excludeFile), { recursive: true });
  const sep = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
  appendFileSync(excludeFile, `${sep}${pattern}\n`);
}

// Copies files the loop needs that git will not check out (untracked or
// ignored) from the target into the matching spot in the worktree.
function copyUntracked(targetPath: string, destCwd: string): string[] {
  const copied: string[] = [];
  for (const rel of ISOLATION_COPY_PATHS) {
    if (!existsSync(join(targetPath, rel))) continue;
    // `--others` without --exclude-standard lists ignored files too.
    const r = git(targetPath, ['ls-files', '--others', '-z', '--', rel]);
    if (!r.ok) continue;
    const files = r.stdout.split('\0').filter(Boolean);
    for (const file of files) {
      const dest = join(destCwd, file);
      try {
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(join(targetPath, file), dest);
      } catch {
        /* best effort — one unreadable file shouldn't sink the run */
      }
    }
    if (files.length > 0) copied.push(rel);
  }
  return copied;
}

export interface PrepareIsolationOptions {
  targetPath: string;
  briefMarkdown?: string | null;
  now?: Date;
}

// Never throws. On any failure returns isolated:false with cwd = target and
// a human-readable reason so the caller can fall back to an in-place run.
export function prepareIsolation(opts: PrepareIsolationOptions): IsolationInfo {
  const { targetPath } = opts;
  const fallback = (reason: string): IsolationInfo => ({
    isolated: false,
    cwd: targetPath,
    dirty: false,
    uncommitted: [],
    copied: [],
    reason,
  });

  const inside = git(targetPath, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.stdout.trim() !== 'true') return fallback('target is not a git repository');
  if (!git(targetPath, ['rev-parse', '--verify', '--quiet', 'HEAD']).ok) {
    return fallback('repository has no commits yet');
  }

  // Target may be a subfolder of the repo; patterns and status paths are
  // relative to the repo root, so carry the prefix along.
  const prefix = git(targetPath, ['rev-parse', '--show-prefix']).stdout.trim();
  try {
    ensureExcluded(targetPath, `${prefix}${WORKTREES_DIR}/`);
    ensureExcluded(targetPath, `${prefix}${RUN_RECORD_FILE}`);
  } catch {
    /* exclude is a nicety; the worktree still works without it */
  }

  const branchOut = git(targetPath, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  const baseRef =
    branchOut && branchOut !== 'HEAD' ? branchOut : git(targetPath, ['rev-parse', '--short', 'HEAD']).stdout.trim();

  const status = git(targetPath, ['-c', 'status.relativePaths=false', 'status', '--porcelain', '--untracked-files=all']);
  const uncommitted = status.ok
    ? uncommittedOutsideCopies(status.stdout.split('\n').filter(Boolean), prefix)
    : [];

  const worktreesRoot = join(targetPath, WORKTREES_DIR);
  const slug = uniqueSlug(makeRunSlug(opts.now ?? new Date(), opts.briefMarkdown), (s) =>
    existsSync(join(worktreesRoot, s)) ||
    git(targetPath, ['rev-parse', '--verify', '--quiet', `refs/heads/${BRANCH_PREFIX}${s}`]).ok,
  );
  const branch = `${BRANCH_PREFIX}${slug}`;
  const worktreePath = join(worktreesRoot, slug);

  try {
    mkdirSync(worktreesRoot, { recursive: true });
  } catch (err) {
    return fallback(`could not create ${worktreesRoot}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const add = git(targetPath, ['worktree', 'add', '-b', branch, worktreePath, 'HEAD']);
  if (!add.ok) return fallback(`git worktree add failed: ${add.stderr || 'unknown error'}`);

  // The worktree is a checkout of the whole repo; run from the same
  // subfolder the user picked.
  const cwd = prefix ? join(worktreePath, prefix.replace(/\/+$/, '')) : worktreePath;
  if (!existsSync(cwd)) mkdirSync(cwd, { recursive: true });
  const copied = copyUntracked(targetPath, cwd);

  return {
    isolated: true,
    cwd,
    worktreePath,
    branch,
    baseRef,
    dirty: uncommitted.length > 0,
    uncommitted,
    copied,
  };
}
