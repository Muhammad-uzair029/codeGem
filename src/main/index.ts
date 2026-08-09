import { app, BrowserWindow, shell, globalShortcut } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import windowStateKeeper from 'electron-window-state';
import { registerWorkspaceIpc } from './services/workspaceService.js';
import { registerInboxIpc } from './services/inboxService.js';
import { registerSkillsIpc } from './services/skillInjectionService.js';
import { registerLoopIpc } from './services/loopService.js';
import { registerPersistentStateIpc } from './services/persistentStateController.js';
import { registerAutoUpdater } from './services/updaterService.js';
import { registerTerminalIpc } from './services/terminalService.js';
import { registerExplorerIpc } from './services/explorerService.js';

const isDev = !app.isPackaged;
const __dirname_ = join(fileURLToPath(import.meta.url), '..');

let mainWin: BrowserWindow | null = null;
const getWin = (): BrowserWindow | null => mainWin;

function createWindow(): void {
  const winState = windowStateKeeper({
    defaultWidth: 1180,
    defaultHeight: 780,
  });

  mainWin = new BrowserWindow({
    x: winState.x,
    y: winState.y,
    width: winState.width,
    height: winState.height,
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

  winState.manage(mainWin);

  // Only capture shortcuts while the app window is focused to avoid
  // stomping on Cmd+O / Cmd+B / Cmd+K in other macOS apps.
  mainWin.on('focus', () => registerShortcuts());
  mainWin.on('blur', () => globalShortcut.unregisterAll());

  mainWin.once('ready-to-show', () => {
    mainWin?.show();
    if (winState.isFullScreen) mainWin?.setFullScreen(true);
    else if (winState.isMaximized) mainWin?.maximize();
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

function registerShortcuts(): void {
  const win = mainWin;
  if (!win) return;

  // Cmd+O — Browse existing directory (relay to renderer).
  globalShortcut.register('CommandOrControl+O', () => {
    win.webContents.send('shortcut:browseExisting');
  });

  // Cmd+B — Collapse/expand config rail.
  globalShortcut.register('CommandOrControl+B', () => {
    win.webContents.send('shortcut:toggleLeft');
  });

  // Cmd+K — Quick-switch project (open recent-projects dropdown).
  globalShortcut.register('CommandOrControl+K', () => {
    win.webContents.send('shortcut:quickSwitch');
  });

  // Cmd+Enter — Launch loop.
  globalShortcut.register('CommandOrControl+Return', () => {
    win.webContents.send('shortcut:launch');
  });

  // Cmd+R — Reload renderer (dev only).
  if (isDev) {
    globalShortcut.register('CommandOrControl+R', () => {
      win.webContents.reload();
    });
  }
}

app.whenReady().then(() => {
  registerWorkspaceIpc(getWin);
  registerInboxIpc();
  registerSkillsIpc();
  registerLoopIpc(getWin);
  registerPersistentStateIpc();
  registerTerminalIpc(getWin);
  registerExplorerIpc();

  createWindow();
  registerAutoUpdater(getWin);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});
