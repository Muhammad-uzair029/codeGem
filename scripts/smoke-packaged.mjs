// Launches the packaged app electron-builder just produced and waits for the
// main process's ready line. CI runs this before uploading installers, so a
// build that can't start (e.g. a main-process error dialog) is never released.
//
//   node scripts/smoke-packaged.mjs            # finds the app under dist/
//   node scripts/smoke-packaged.mjs <binary>
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TIMEOUT_MS = 45_000;
const READY = /\[codegem\] ready v\d+\.\d+\.\d+/;

function findBinary() {
  const dist = 'dist';
  const dirs = existsSync(dist) ? readdirSync(dist, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
  for (const d of dirs) {
    const dir = join(dist, d);
    if (process.platform === 'darwin' && d.startsWith('mac')) {
      const app = readdirSync(dir).find((f) => f.endsWith('.app'));
      if (app) return join(dir, app, 'Contents', 'MacOS', app.replace(/\.app$/, ''));
    }
    if (process.platform === 'win32' && d === 'win-unpacked') {
      const exe = readdirSync(dir).find((f) => f.endsWith('.exe') && !/uninstall/i.test(f));
      if (exe) return join(dir, exe);
    }
    if (process.platform === 'linux' && d === 'linux-unpacked') {
      const skip = new Set(['chrome-sandbox', 'chrome_crashpad_handler']);
      const bin = readdirSync(dir, { withFileTypes: true }).find(
        (f) => f.isFile() && !f.name.includes('.') && !skip.has(f.name),
      );
      if (bin) return join(dir, bin.name);
    }
  }
  return null;
}

const bin = process.argv[2] || findBinary();
if (!bin || !existsSync(bin)) {
  console.error(`smoke-packaged: no packaged app found (looked under dist/ for ${process.platform})`);
  process.exit(1);
}

// ELECTRON_ENABLE_LOGGING makes the packaged app flush stdout promptly.
const args = process.platform === 'linux' ? ['--no-sandbox'] : [];
const child = spawn(bin, args, {
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1', ELECTRON_DISABLE_AUTO_UPDATE: '1' },
});
let out = '';
const done = (ok, why) => {
  clearTimeout(timer);
  child.kill();
  console.log(ok ? `smoke-packaged: OK — ${why}` : `smoke-packaged: FAILED — ${why}\n--- output ---\n${out.slice(-4000)}`);
  process.exit(ok ? 0 : 1);
};
const onData = (d) => {
  out += d;
  const m = out.match(READY);
  if (m) done(true, `${bin} printed "${m[0]}"`);
};
child.stdout.on('data', onData);
child.stderr.on('data', onData);
child.on('exit', (code) => done(false, `app exited early with code ${code}`));
const timer = setTimeout(() => done(false, `no ready line within ${TIMEOUT_MS / 1000}s`), TIMEOUT_MS);
