// Electron ≥ 38 no longer downloads its binary on install; `install-electron`
// does it on demand. Fetch it for local dev/tests. CI only packages (electron-
// builder brings its own Electron), so skip the extra download there.
// Needs Node ≥ 22.12 (@electron/get is ESM, loaded via require).
import { spawnSync } from 'node:child_process';

if (process.env.CI) {
  console.log('[ensure-electron] CI: skipping Electron binary download');
  process.exit(0);
}
const r = spawnSync(process.execPath, ['node_modules/electron/install.js'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
