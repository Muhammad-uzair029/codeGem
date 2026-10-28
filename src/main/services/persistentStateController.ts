import { ipcMain } from 'electron';
import type { PersistentConfig, ProjectType, TargetFramework } from '@shared/ipc';
import {
  clearActiveProject,
  readConfig,
  setActiveProject,
  setIsolateRuns,
  setLayout,
} from './projectStateService.js';

export function registerPersistentStateIpc(): void {
  ipcMain.handle('state:read', async (): Promise<PersistentConfig> => readConfig());

  ipcMain.handle(
    'state:setActive',
    async (
      _evt,
      patch: {
        active_project_path: string;
        project_type: ProjectType;
        target_framework: TargetFramework | null;
      },
    ): Promise<PersistentConfig> => setActiveProject(patch),
  );

  ipcMain.handle('state:clearActive', async (): Promise<PersistentConfig> => clearActiveProject());

  ipcMain.handle(
    'state:setLayout',
    async (_evt, sizes: [number, number, number]): Promise<PersistentConfig> => setLayout(sizes),
  );

  ipcMain.handle(
    'state:setIsolateRuns',
    async (_evt, on: boolean): Promise<PersistentConfig> => setIsolateRuns(on === true),
  );
}
