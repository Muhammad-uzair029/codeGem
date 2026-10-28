/**
 * Packaged-app suite: hardening checks against the real .app bundle.
 *
 * Runs against the .app built by `pnpm pack:dir`, not the dev build.
 * Execute with: pnpm test:e2e:packaged
 *
 * The packaged app flips Electron fuses (scripts/fuses.cjs) and refuses
 * Chromium debugging flags, so Playwright can no longer attach to it —
 * that's the point. These tests drive the binary as an attacker would and
 * assert each route is closed, plus that a normal launch still works
 * (the main process prints its ready line).
 */
import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, openSync, writeSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';

const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, '..', 'dist', `mac-${process.arch}`, 'SkillFacet.app');
const BIN = join(APP, 'Contents', 'MacOS', 'SkillFacet');

test.skip(!existsSync(BIN), `Packaged .app not found at ${APP}. Run 'pnpm pack:dir' first.`);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Launch the binary, let it settle, report whether it's still alive + its output.
async function run(bin: string, args: string[] = [], env: NodeJS.ProcessEnv = {}, settleMs = 6000) {
  let out = '';
  const child: ChildProcess = spawn(bin, args, { env: { ...process.env, ELECTRON_DISABLE_AUTO_UPDATE: '1', ...env } });
  child.stdout?.on('data', (d) => (out += d));
  child.stderr?.on('data', (d) => (out += d));
  let exited = false;
  child.on('exit', () => (exited = true));
  await wait(settleMs);
  const alive = !exited;
  child.kill('SIGTERM');
  await wait(500);
  return { alive, out };
}

const portOpen = (port: number) =>
  new Promise<boolean>((done) => {
    const s = createConnection({ port, host: '127.0.0.1' });
    s.once('connect', () => { s.destroy(); done(true); });
    s.once('error', () => done(false));
  });

test.describe.configure({ mode: 'serial', timeout: 60_000 });

test('[packaged] normal launch runs the main process', async () => {
  // "Alive" alone isn't enough: a main-process crash shows an error dialog
  // and leaves the process running. The ready line proves our code ran.
  // ELECTRON_ENABLE_LOGGING makes a packaged app flush stdout; without it
  // the ready line can be lost when the process is stopped.
  const { alive, out } = await run(BIN, [], { ELECTRON_ENABLE_LOGGING: '1' });
  expect(out).toMatch(/\[codegem\] ready v\d+\.\d+\.\d+/);
  expect(out).not.toMatch(/Integrity check failed|Uncaught|A JavaScript error/i);
  expect(alive).toBe(true);
});

test('[packaged] cannot be used as a plain Node runtime', async () => {
  const { out } = await run(BIN, ['-e', "console.log('NODE-RUNTIME-EXPOSED')"], { ELECTRON_RUN_AS_NODE: '1' }, 4000);
  expect(out).not.toContain('NODE-RUNTIME-EXPOSED');
});

test('[packaged] Node inspector cannot be attached', async () => {
  const { alive } = await run(BIN, ['--inspect=9333'], {}, 4000);
  expect(await portOpen(9333)).toBe(false);
  expect(alive).toBe(false);
});

test('[packaged] refuses to start with Chromium remote debugging', async () => {
  const { alive } = await run(BIN, ['--remote-debugging-port=9334'], {}, 4000);
  expect(alive).toBe(false);
});

test('[packaged] refuses to start when app.asar is modified', async () => {
  const copy = join(mkdtempSync(join(tmpdir(), 'cg-tamper-')), 'Tampered.app');
  cpSync(APP, copy, { recursive: true, verbatimSymlinks: true });
  const fd = openSync(join(copy, 'Contents', 'Resources', 'app.asar'), 'r+');
  writeSync(fd, Buffer.from('X'), 0, 1, 5000);
  closeSync(fd);
  const { alive, out } = await run(join(copy, 'Contents', 'MacOS', 'SkillFacet'), [], {}, 4000);
  expect(alive).toBe(false);
  expect(out).toMatch(/Integrity check failed/i);
});
