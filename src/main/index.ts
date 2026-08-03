import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerWorkspaceIpc } from './services/workspaceService.js';
import { registerInboxIpc } from './services/inboxService.js';
import { registerSkillsIpc } from './services/skillInjectionService.js';
import { registerLoopIpc } from './services/loopService.js';
import { registerPersistentStateIpc } from './services/persistentStateController.js';
import { registerAutoUpdater } from './services/updaterService.js';

const isDev = !app.isPackaged;
const __dirname_ = join(fileURLToPath(import.meta.url), '..');

let mainWin: BrowserWindow | null = null;
const getWin = (): BrowserWindow | null => mainWin;

function createWindow(): void {
  mainWin = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0b0d10',
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      preload: join(__dirname_, '..', 'preload', 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWin.once('ready-to-show', () => {
    mainWin?.show();
  });

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWin.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void mainWin.loadFile(join(__dirname_, '..', 'renderer', 'index.html'));
  }
}

app.whenReady().then(() => {
  registerWorkspaceIpc(getWin);
  registerInboxIpc();
  registerSkillsIpc();
  registerLoopIpc(getWin);
  registerPersistentStateIpc();

  createWindow();
  registerAutoUpdater(getWin);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
