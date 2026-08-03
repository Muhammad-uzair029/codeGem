import { ipcMain, type BrowserWindow } from 'electron';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  LaunchRequest,
  LaunchResult,
  LoopExitEvent,
  LoopStage,
  LoopStreamChunk,
} from '@shared/ipc';
import { BRIEF_FILENAME, CLIENT_CLAUDE_BLUEPRINT } from '@shared/projectSchema';

interface Session {
  id: string;
  proc: ChildProcess;
  targetPath: string;
  stage: LoopStage;
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

export function registerLoopIpc(getWin: () => BrowserWindow | null): void {
  ipcMain.handle('loop:launch', async (_evt, req: LaunchRequest): Promise<LaunchResult> => {
    if (!req?.targetPath || !existsSync(req.targetPath) || !statSync(req.targetPath).isDirectory()) {
      return { ok: false, reason: 'Invalid targetPath.' };
    }
    // Defense-in-depth: the renderer disables launch until the brief is
    // written, and the main process re-checks here so a compromised
    // renderer can't bypass the mandatory feature-doc gate.
    const briefPath = join(req.targetPath, CLIENT_CLAUDE_BLUEPRINT.dirs.specs.inbox, BRIEF_FILENAME);
    if (!existsSync(briefPath) || statSync(briefPath).size === 0) {
      return {
        ok: false,
        reason: `Feature brief missing at ${briefPath}. Write it via the intake panel before launching.`,
      };
    }

    const cli = findClaudeCli();
    const forceAutonomous = req.forceAutonomous ?? true;
    const extras = req.extraArgs ?? [];

    const args: string[] = [];
    if (cli.usesNpx) args.push('--yes', '@anthropic-ai/claude-code');
    args.push('-p', '/feature-loop' + (forceAutonomous ? ' --force-autonomous' : ''));
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

    let proc: ChildProcess;
    try {
      proc = spawn(cli.cmd, args, {
        cwd: req.targetPath,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          FORCE_COLOR: '1',
          FEATURE_LOOP_MANAGER_SESSION_ID: id,
        },
      });
    } catch (err) {
      return {
        ok: false,
        reason: `Failed to spawn ${cli.cmd}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    proc.unref();

    const session: Session = { id, proc, targetPath: req.targetPath, stage: 'unknown' };
    sessions.set(id, session);

    emitChunk({
      channel: 'system',
      data: `[feature-loop-manager] launch cli=${cli.cmd} pid=${proc.pid} cwd=${req.targetPath}\n`,
      stage: 'unknown',
    });

    const handleData = (channel: 'stdout' | 'stderr') => (buf: Buffer) => {
      const s = session;
      const text = buf.toString('utf8');
      for (const line of text.split(/\r?\n/)) {
        if (line.length === 0) continue;
        s.stage = detectStage(line, s.stage);
      }
      emitChunk({ channel, data: text, stage: s.stage });
    };

    proc.stdout?.on('data', handleData('stdout'));
    proc.stderr?.on('data', handleData('stderr'));

    proc.on('exit', (code, signal) => {
      emitChunk({
        channel: 'system',
        data: `[feature-loop-manager] exit code=${code ?? 'null'} signal=${signal ?? 'null'}\n`,
        stage: session.stage,
      });
      emitExit({ code, signal });
      sessions.delete(id);
    });

    proc.on('error', (err) => {
      emitChunk({
        channel: 'stderr',
        data: `[feature-loop-manager] child error: ${err.message}\n`,
        stage: session.stage,
      });
    });

    return { ok: true, sessionId: id, pid: proc.pid };
  });

  ipcMain.handle('loop:stop', async (_evt, sessionId: string) => {
    const s = sessions.get(sessionId);
    if (!s) return { ok: false };
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
