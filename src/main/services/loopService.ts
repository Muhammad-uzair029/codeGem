import { ipcMain, type BrowserWindow } from 'electron';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  IsolationInfo,
  LaunchRequest,
  LaunchResult,
  LoopExitEvent,
  LoopStage,
  LoopStreamChunk,
  RunRecord,
} from '@shared/ipc';
import { BRIEF_FILENAME, CLIENT_CLAUDE_BLUEPRINT } from '@shared/projectSchema';
import {
  buildLoopPrompt,
  findSpecFolder,
  isResumable,
  resumeFromSpec,
  reviewInstructions,
  statusFromExit,
  stageWantsSpec,
} from './loopHelpers.js';
import { prepareIsolation } from './worktreeService.js';
import { getRun, latestRun, recoverCrashed, saveRun } from './runStore.js';
import { isolateRunsEnabled } from './projectStateService.js';

interface Session {
  id: string;
  proc: ChildProcess;
  targetPath: string;
  stage: LoopStage;
  run: RunRecord;
  stopRequested: boolean;
}

const sessions = new Map<string, Session>();

function detectStage(line: string, prev: LoopStage): LoopStage {
  const lower = line.toLowerCase();
  if (/\bprd[- ]splitter\b|\bstage[\s-]*-?1\b/.test(lower)) return 'intake';
  if (/brainstorm|\bstage[\s-]*0\b/.test(lower)) return 'brainstorm';
  if (/spec[- ]writer|\bstage[\s-]*1\b/.test(lower)) return 'spec';
  if (/implement(er|ing)|\bstage[\s-]*2\b/.test(lower)) return 'implement';
  if (/verifier|self[- ]heal|\bstage[\s-]*3\b/.test(lower)) return 'verify';
  if (/learnings|\bstage[\s-]*5\b|\bship\b|\bescalate\b/.test(lower)) return 'learn';
  return prev;
}

function which(bin: string): boolean {
  try {
    const r = spawnSync('which', [bin], { encoding: 'utf8' });
    return r.status === 0 && (r.stdout ?? '').trim().length > 0;
  } catch {
    return false;
  }
}

function findClaudeCli(): { cmd: string; usesNpx: boolean } {
  if (which('claude')) return { cmd: 'claude', usesNpx: false };
  if (which('claude-code')) return { cmd: 'claude-code', usesNpx: false };
  return { cmd: 'npx', usesNpx: true };
}

function isolationLines(iso: IsolationInfo, resumed: boolean): string[] {
  if (resumed) {
    return [`resuming in ${iso.isolated ? `worktree ${iso.worktreePath} (branch ${iso.branch})` : 'place'}`];
  }
  if (!iso.isolated) return [`running in place: ${iso.reason ?? 'isolation unavailable'}`];
  const lines = [`isolated run in worktree ${iso.worktreePath} on branch ${iso.branch} (from ${iso.baseRef})`];
  if (iso.copied.length > 0) lines.push(`copied untracked into worktree: ${iso.copied.join(', ')}`);
  if (iso.dirty) {
    const sample = iso.uncommitted.slice(0, 5).join(', ');
    const more = iso.uncommitted.length > 5 ? ` (+${iso.uncommitted.length - 5} more)` : '';
    lines.push(`WARNING: uncommitted changes are NOT included in the isolated run: ${sample}${more}`);
  }
  return lines;
}

export function registerLoopIpc(getWin: () => BrowserWindow | null): void {
  recoverCrashed();

  ipcMain.handle('loop:latestRun', async (_evt, targetPath: string): Promise<RunRecord | null> =>
    typeof targetPath === 'string' && targetPath ? latestRun(targetPath) : null,
  );

  ipcMain.handle('loop:launch', async (_evt, req: LaunchRequest): Promise<LaunchResult> => {
    if (!req?.targetPath || !existsSync(req.targetPath) || !statSync(req.targetPath).isDirectory()) {
      return { ok: false, reason: 'Invalid targetPath.' };
    }
    // Defense-in-depth: the renderer disables launch until the brief is
    // written, and the main process re-checks here so a compromised
    // renderer can't bypass the mandatory feature-doc gate. Always checks
    // the original target, before anything is copied into a worktree.
    const briefPath = join(req.targetPath, CLIENT_CLAUDE_BLUEPRINT.dirs.specs.inbox, BRIEF_FILENAME);
    if (!existsSync(briefPath) || statSync(briefPath).size === 0) {
      return {
        ok: false,
        reason: `Feature brief missing at ${briefPath}. Write it via the intake panel before launching.`,
      };
    }

    // Resume reuses the previous run's cwd (worktree or target) as-is.
    let prev: RunRecord | null = null;
    if (req.resumeRunId) {
      prev = getRun(req.resumeRunId);
      if (!prev || prev.targetPath !== req.targetPath) return { ok: false, reason: 'Run to resume not found.' };
      if (!isResumable(prev)) return { ok: false, reason: `Run is ${prev.status}; only failed or stopped runs resume.` };
      if (!existsSync(prev.cwd)) return { ok: false, reason: `Run folder no longer exists: ${prev.cwd}` };
    }

    let iso: IsolationInfo;
    let fromSpec: string | null = null;
    if (prev) {
      iso = {
        isolated: prev.isolated,
        cwd: prev.cwd,
        worktreePath: prev.worktreePath ?? undefined,
        branch: prev.branch ?? undefined,
        baseRef: prev.baseRef ?? undefined,
        dirty: false,
        uncommitted: [],
        copied: [],
      };
      const chainStart = prev.chainStartedAt ?? prev.startedAt;
      const spec = stageWantsSpec(prev.lastStage)
        ? (prev.fromSpec ?? findSpecFolder(prev.cwd, Date.parse(chainStart)))
        : null;
      fromSpec = resumeFromSpec(prev.lastStage, spec);
    } else if (req.isolate ?? isolateRunsEnabled()) {
      let briefMarkdown = '';
      try {
        briefMarkdown = readFileSync(briefPath, 'utf8');
      } catch {
        /* slug falls back to timestamp only */
      }
      iso = prepareIsolation({ targetPath: req.targetPath, briefMarkdown });
    } else {
      iso = {
        isolated: false,
        cwd: req.targetPath,
        dirty: false,
        uncommitted: [],
        copied: [],
        reason: 'worktree isolation is turned off',
      };
    }

    const cli = findClaudeCli();
    const forceAutonomous = req.forceAutonomous ?? true;
    const extras = req.extraArgs ?? [];

    const args: string[] = [];
    if (cli.usesNpx) args.push('--yes', '@anthropic-ai/claude-code');
    args.push('-p', buildLoopPrompt({ forceAutonomous, fromSpec }));
    args.push(...extras);

    const id = randomUUID();
    const win = getWin();
    const emitChunk = (chunk: Omit<LoopStreamChunk, 'sessionId' | 'ts'>) => {
      const payload: LoopStreamChunk = { sessionId: id, ts: Date.now(), ...chunk };
      win?.webContents.send('loop:chunk', payload);
    };
    const emitExit = (evt: Omit<LoopExitEvent, 'sessionId' | 'ts'>) => {
      const payload: LoopExitEvent = { sessionId: id, ts: Date.now(), ...evt };
      win?.webContents.send('loop:exit', payload);
    };
    const emitSystem = (lines: string[], stage: LoopStage) => {
      if (lines.length === 0) return;
      emitChunk({
        channel: 'system',
        data: lines.map((l) => `[skillfacet] ${l}\n`).join(''),
        stage,
      });
    };

    let proc: ChildProcess;
    try {
      proc = spawn(cli.cmd, args, {
        cwd: iso.cwd,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          FORCE_COLOR: '1',
          FEATURE_LOOP_MANAGER_SESSION_ID: id,
        },
      });
    } catch (err) {
      const where = iso.isolated && !prev ? ` (worktree left at ${iso.worktreePath})` : '';
      return {
        ok: false,
        reason: `Failed to spawn ${cli.cmd}: ${err instanceof Error ? err.message : String(err)}${where}`,
      };
    }

    proc.unref();

    const startedAt = new Date().toISOString();
    const run: RunRecord = saveRun({
      id,
      targetPath: req.targetPath,
      cwd: iso.cwd,
      isolated: iso.isolated,
      worktreePath: iso.worktreePath ?? null,
      branch: iso.branch ?? null,
      baseRef: iso.baseRef ?? null,
      startedAt,
      endedAt: null,
      lastStage: 'unknown',
      exitCode: null,
      signal: null,
      status: 'running',
      args,
      ...(prev
        ? { resumedFrom: prev.id, chainStartedAt: prev.chainStartedAt ?? prev.startedAt, fromSpec }
        : {}),
    });

    const session: Session = {
      id,
      proc,
      targetPath: req.targetPath,
      stage: 'unknown',
      run,
      stopRequested: false,
    };
    sessions.set(id, session);

    emitChunk({
      channel: 'system',
      data: `[skillfacet] launch cli=${cli.cmd} pid=${proc.pid} cwd=${iso.cwd}\n`,
      stage: 'unknown',
    });
    emitSystem(isolationLines(iso, Boolean(prev)), 'unknown');
    if (prev) {
      emitSystem(
        [
          fromSpec
            ? `resume: last stage ${prev.lastStage}, continuing from spec ${fromSpec}`
            : `resume: last stage ${prev.lastStage}, re-running /feature-loop (it resumes on its own)`,
        ],
        'unknown',
      );
    }

    let finalized = false;
    const finalize = (code: number | null, signal: string | null) => {
      if (finalized) return;
      finalized = true;
      session.run = saveRun({
        ...session.run,
        endedAt: new Date().toISOString(),
        lastStage: session.stage,
        exitCode: code,
        signal,
        status: statusFromExit(code, session.stopRequested),
      });
      sessions.delete(id);
    };

    const handleData = (channel: 'stdout' | 'stderr') => (buf: Buffer) => {
      const s = session;
      const text = buf.toString('utf8');
      const before = s.stage;
      for (const line of text.split(/\r?\n/)) {
        if (line.length === 0) continue;
        s.stage = detectStage(line, s.stage);
      }
      // Persist stage transitions so a crash still leaves a useful lastStage.
      if (s.stage !== before && !finalized) s.run = saveRun({ ...s.run, lastStage: s.stage });
      emitChunk({ channel, data: text, stage: s.stage });
    };

    proc.stdout?.on('data', handleData('stdout'));
    proc.stderr?.on('data', handleData('stderr'));

    proc.on('exit', (code, signal) => {
      emitChunk({
        channel: 'system',
        data: `[skillfacet] exit code=${code ?? 'null'} signal=${signal ?? 'null'}\n`,
        stage: session.stage,
      });
      finalize(code, signal);
      const review =
        session.run.isolated && session.run.worktreePath && session.run.branch && session.run.baseRef
          ? reviewInstructions({
              targetPath: session.run.targetPath,
              worktreePath: session.run.worktreePath,
              branch: session.run.branch,
              baseRef: session.run.baseRef,
            })
          : undefined;
      if (review) emitSystem(['run finished in an isolated worktree; review and merge with:', ...review], session.stage);
      emitExit({ code, signal, run: session.run, review });
    });

    proc.on('error', (err) => {
      emitChunk({
        channel: 'stderr',
        data: `[skillfacet] child error: ${err.message}\n`,
        stage: session.stage,
      });
      // A failed spawn (e.g. ENOENT) never emits 'exit'; close the record.
      if (proc.pid === undefined && !finalized) {
        finalize(null, null);
        emitExit({ code: null, signal: null, run: session.run });
      }
    });

    return { ok: true, sessionId: id, pid: proc.pid, isolation: iso, run };
  });

  ipcMain.handle('loop:stop', async (_evt, sessionId: string) => {
    const s = sessions.get(sessionId);
    if (!s) return { ok: false };
    s.stopRequested = true;
    s.run = saveRun({ ...s.run, status: 'stopped', lastStage: s.stage });
    try {
      if (s.proc.pid) {
        try {
          process.kill(-s.proc.pid, 'SIGTERM');
        } catch {
          s.proc.kill('SIGTERM');
        }
      }
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });
}
