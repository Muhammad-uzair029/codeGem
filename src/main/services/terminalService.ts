import { ipcMain } from 'electron';
import { spawn } from 'node-pty';
import type { IPty } from 'node-pty';
import type { BrowserWindow } from 'electron';
import type {
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalOpenRequest,
  TerminalOpenResult,
  TerminalResizeRequest,
  TerminalWriteRequest,
} from '@shared/ipc';
import { randomUUID } from 'node:crypto';

interface Session {
  pty: IPty;
  projectPath: string;
}

const sessions = new Map<string, Session>();

function getShell(): string {
  return process.env['SHELL'] ?? (process.platform === 'win32' ? 'powershell.exe' : 'bash');
}

export function registerTerminalIpc(getWin: () => BrowserWindow | null): void {
  ipcMain.handle(
    'terminal:open',
    (_evt, req: TerminalOpenRequest): TerminalOpenResult => {
      try {
        const sessionId = randomUUID();
        const shell = getShell();
        const pty = spawn(shell, [], {
          name: 'xterm-256color',
          cwd: req.projectPath,
          env: { ...process.env } as Record<string, string>,
          cols: 80,
          rows: 24,
        });

        pty.onData((data) => {
          const win = getWin();
          if (!win) return;
          const evt: TerminalDataEvent = { sessionId, data };
          win.webContents.send('terminal:data', evt);
        });

        pty.onExit(({ exitCode }) => {
          sessions.delete(sessionId);
          const win = getWin();
          if (!win) return;
          const evt: TerminalExitEvent = { sessionId, code: exitCode ?? null };
          win.webContents.send('terminal:exit', evt);
        });

        sessions.set(sessionId, { pty, projectPath: req.projectPath });
        return { ok: true, sessionId };
      } catch (err) {
        return { ok: false, sessionId: '', reason: String(err) };
      }
    },
  );

  ipcMain.handle('terminal:write', (_evt, req: TerminalWriteRequest): void => {
    sessions.get(req.sessionId)?.pty.write(req.data);
  });

  ipcMain.handle('terminal:resize', (_evt, req: TerminalResizeRequest): void => {
    const s = sessions.get(req.sessionId);
    if (s && req.cols > 0 && req.rows > 0) {
      s.pty.resize(req.cols, req.rows);
    }
  });

  ipcMain.handle('terminal:close', (_evt, sessionId: string): { ok: boolean } => {
    const s = sessions.get(sessionId);
    if (!s) return { ok: false };
    try {
      s.pty.kill();
    } catch {/* noop */}
    sessions.delete(sessionId);
    return { ok: true };
  });
}
