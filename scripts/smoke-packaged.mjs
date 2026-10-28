// Launches the packaged app electron-builder just produced and waits for the
// main process's ready line. CI runs this before uploading installers, so a
// build that can't start (e.g. a main-process error dialog) is never released.
//
//   node scripts/smoke-packaged.mjs            # finds the app under dist/
//   node scripts/smoke-packaged.mjs <binary>
import { spawn } from 'node:child_process';
import { existsSync, openSync, readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Generous: macOS scans a new unsigned bundle on its first launch.
const TIMEOUT_MS = 90_000;
const READY = /\[codegem\] ready v\d+\.\d+\.\d+/;

function findBinary() {
  const dist = 'dist';
  const dirs = existsSync(dist) ? readdirSync(dist, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
  for (const d of dirs) {
    const dir = join(dist, d);
    // electron-builder writes x64 to dist/mac and arm64 to dist/mac-arm64;
    // test the build for this machine's CPU (an x64 app on an arm64 runner
    // needs Rosetta and just hangs).
    if (process.platform === 'darwin' && d === (process.arch === 'arm64' ? 'mac-arm64' : 'mac')) {
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

// Output goes to a file, not a pipe: on some runners (GitHub's macOS arm64)
// a packaged app's piped stdout never arrives, while a file is written fine.
// ELECTRON_ENABLE_LOGGING makes the app flush stdout promptly.
const logFile = join(mkdtempSync(join(tmpdir(), 'smoke-packaged-')), 'app.log');
const fd = openSync(logFile, 'a');
const args = process.platform === 'linux' ? ['--no-sandbox'] : [];
const child = spawn(bin, args, {
  stdio: ['ignore', fd, fd],
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1', ELECTRON_DISABLE_AUTO_UPDATE: '1' },
});
const output = () => { try { return readFileSync(logFile, 'utf8'); } catch { return ''; } };
const done = (ok, why) => {
  clearInterval(poll);
  clearTimeout(timer);
  child.kill();
  console.log(ok ? `smoke-packaged: OK — ${why}` : `smoke-packaged: FAILED (${bin}) — ${why}\n--- output ---\n${output().slice(-4000)}`);
  process.exit(ok ? 0 : 1);
};
const poll = setInterval(() => {
  const m = output().match(READY);
  if (m) done(true, `${bin} printed "${m[0]}"`);
}, 500);
child.on('exit', (code) => done(false, `app exited early with code ${code}`));
const timer = setTimeout(() => done(false, `no ready line within ${TIMEOUT_MS / 1000}s`), TIMEOUT_MS);
