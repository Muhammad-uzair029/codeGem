import { app, type BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';

// electron-updater is CJS; ESM default import brings the module namespace.
const { autoUpdater } = electronUpdater;

// Wire auto-update. Behavior:
//   - Dev mode → skip entirely (no update.yml on disk, would error).
//   - Prod    → check on ready, silently download, notify the renderer
//               when an update is downloaded so the user can restart.
//
// electron-updater talks to the GitHub Releases feed configured in
// package.json `build.publish`. For private repos, GH_TOKEN must be set
// at build time; for public repos, no token is needed to pull updates.
export function registerAutoUpdater(getWin: () => BrowserWindow | null): void {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  const send = (channel: string, payload: unknown) => {
    getWin()?.webContents.send(channel, payload);
  };

  autoUpdater.on('checking-for-update', () => send('updater:status', { state: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    send('updater:status', { state: 'available', version: info.version }),
  );
  autoUpdater.on('update-not-available', () => send('updater:status', { state: 'up-to-date' }));
  autoUpdater.on('download-progress', (p) =>
    send('updater:status', {
      state: 'downloading',
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
    }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    send('updater:status', { state: 'downloaded', version: info.version }),
  );
  autoUpdater.on('error', (err) =>
    send('updater:status', { state: 'error', message: err.message }),
  );

  // Kick off a check shortly after launch so the window is up first.
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {
      /* swallow — surfaced via 'error' event above */
    });
  }, 5_000);
}
