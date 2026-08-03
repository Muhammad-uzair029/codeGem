import { dialog, ipcMain, type BrowserWindow } from 'electron';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ExistingWorkspaceValidation,
  FrameworkDetection,
  NewWorkspaceRequest,
  NewWorkspaceResult,
} from '@shared/ipc';
import { desktopDefault } from './pathService.js';
import { detectFramework } from './projectStateService.js';

const IDENT_RX = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

export function registerWorkspaceIpc(getWin: () => BrowserWindow | null): void {
  ipcMain.handle('workspace:pickExistingDir', async () => {
    const win = getWin();
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Select an existing project directory',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    'workspace:validateExisting',
    async (_evt, path: string): Promise<ExistingWorkspaceValidation> => {
      if (!path || typeof path !== 'string') {
        return {
          ok: false,
          path: '',
          hasGit: false,
          hasPackageJson: false,
          hasClaudeDir: false,
          reason: 'No path supplied.',
        };
      }
      if (!existsSync(path)) {
        return {
          ok: false,
          path,
          hasGit: false,
          hasPackageJson: false,
          hasClaudeDir: false,
          reason: 'Path does not exist.',
        };
      }
      const s = statSync(path);
      if (!s.isDirectory()) {
        return {
          ok: false,
          path,
          hasGit: false,
          hasPackageJson: false,
          hasClaudeDir: false,
          reason: 'Path is not a directory.',
        };
      }
      const hasGit = existsSync(join(path, '.git'));
      const hasPackageJson = existsSync(join(path, 'package.json'));
      const hasClaudeDir = existsSync(join(path, '.claude'));
      return {
        ok: hasGit && hasPackageJson,
        path,
        hasGit,
        hasPackageJson,
        hasClaudeDir,
        reason: hasGit && hasPackageJson ? undefined : 'Missing .git or package.json.',
      };
    },
  );

  ipcMain.handle('workspace:pickParentDir', async () => {
    const win = getWin();
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Select the parent directory for the new project',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: desktopDefault(),
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('workspace:defaultParentDir', async () => desktopDefault());

  ipcMain.handle(
    'workspace:scaffoldNew',
    async (_evt, req: NewWorkspaceRequest): Promise<NewWorkspaceResult> => {
      const { parentDir, projectName } = req ?? {};
      if (!parentDir || !projectName) {
        return { ok: false, path: '', reason: 'Missing parentDir or projectName.' };
      }
      if (!IDENT_RX.test(projectName)) {
        return {
          ok: false,
          path: '',
          reason: 'Project name must be kebab-case alphanumerics (1-64 chars).',
        };
      }
      if (!existsSync(parentDir)) {
        return { ok: false, path: '', reason: `Parent dir does not exist: ${parentDir}.` };
      }
      const target = join(parentDir, projectName);
      if (existsSync(target)) {
        return { ok: false, path: target, reason: 'Target directory already exists.' };
      }
      try {
        mkdirSync(target, { recursive: false });
        writeFileSync(
          join(target, 'README.md'),
          `# ${projectName}\n\nScaffolded by feature-loop-manager on ${new Date().toISOString()}.\n`,
        );
        writeFileSync(
          join(target, 'package.json'),
          JSON.stringify(
            {
              name: projectName,
              version: '0.0.0',
              private: true,
              scripts: {
                dev: 'echo "TODO: wire dev script"',
                build: 'echo "TODO: wire build script"',
                test: 'echo "TODO: wire test script"',
                lint: 'echo "TODO: wire lint script"',
                typecheck: 'echo "TODO: wire typecheck script"',
              },
            },
            null,
            2,
          ) + '\n',
        );
        writeFileSync(
          join(target, '.gitignore'),
          [
            'node_modules/',
            'dist/',
            'out/',
            '.env',
            '.env.local',
            '.DS_Store',
            '.claude/specs/*/build/',
            '.claude/specs/*/verify/',
          ].join('\n') + '\n',
        );
        execFileSync('git', ['init', '--initial-branch=main'], { cwd: target, stdio: 'ignore' });
        return { ok: true, path: target };
      } catch (err) {
        return {
          ok: false,
          path: target,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle(
    'workspace:detectFramework',
    async (_evt, path: string): Promise<FrameworkDetection> => detectFramework(path),
  );
}
