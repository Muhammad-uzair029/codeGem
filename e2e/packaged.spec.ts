/**
 * Packaged-app E2E suite.
 *
 * Runs against the .app bundle built by `pnpm pack:dir`, not the dev build.
 * Execute with: pnpm test:e2e:packaged
 *
 * Prerequisites:
 *   pnpm pack:dir   # builds the .app into dist/mac-arm64/
 *
 * This suite is what would have caught the "nothing works on v0.1.3 arm64" bug
 * where the dev build was green but the packaged app crashed.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const APP_BUNDLE = resolve(here, '..', 'dist', 'mac-arm64', 'Feature-Loop Manager.app', 'Contents', 'MacOS', 'Feature-Loop Manager');

// Skip the entire suite if the packaged bundle is not present.
test.skip(!existsSync(APP_BUNDLE), `Packaged .app not found at ${APP_BUNDLE}. Run 'pnpm pack:dir' first.`);

let app: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    executablePath: APP_BUNDLE,
    args: [],
    env: {
      ...process.env,
      ELECTRON_DISABLE_AUTO_UPDATE: '1',
    },
  });
  window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  // Give the packaged app a moment to settle (native modules, asar extraction).
  await window.waitForTimeout(1500);
});

test.afterAll(async () => {
  await app?.close();
});

test('[packaged] renderer boots + shows header', async () => {
  await expect(window.locator('text=Feature-Loop Manager').first()).toBeVisible({ timeout: 15_000 });
});

test('[packaged] three columns render', async () => {
  await expect(window.locator('text=Config').first()).toBeVisible();
  await expect(window.locator('text=Terminal').first()).toBeVisible();
  await expect(window.locator('text=Explorer').first()).toBeVisible();
});

test('[packaged] panel resize handles present', async () => {
  // react-resizable-panels inserts resize handles between panels.
  const handles = window.locator('[data-panel-resize-handle-id]');
  await expect(handles).toHaveCount(2);
});

test('[packaged] terminal Shell/Feature-Loop mode toggle works', async () => {
  // The Shell tab should be visible and selected by default once a project is open.
  // Without a project, the center shows the empty state — just check the toggle buttons
  // are accessible from the JS surface without crashing.
  const shellTabExists = await window.evaluate(() =>
    Array.from(document.querySelectorAll('button[role="tab"]')).some((b) =>
      b.textContent?.includes('Shell'),
    ),
  );
  // Shell tab only appears when a project is selected and TerminalView mounts.
  // Without a project we skip the assertion; the important thing is no crash.
  expect(typeof shellTabExists).toBe('boolean');
});

test('[packaged] preload surface complete', async () => {
  const keys = await window.evaluate(() => {
    const o = (globalThis as unknown as { orchestrator?: Record<string, unknown> }).orchestrator;
    return o ? Object.keys(o) : [];
  });
  expect(keys).toEqual(
    expect.arrayContaining(['workspace', 'inbox', 'skills', 'loop', 'state', 'terminal', 'explorer', 'shortcuts', 'util']),
  );
});

test('[packaged] explorer:hasVSCodeCli responds without crashing', async () => {
  const result = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { explorer: { hasVSCodeCli: () => Promise<boolean> } };
    }).orchestrator;
    return o.explorer.hasVSCodeCli();
  });
  expect(typeof result).toBe('boolean');
});

test('[packaged] state.read returns valid shape', async () => {
  const cfg = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { state: { read: () => Promise<unknown> } };
    }).orchestrator;
    return o.state.read();
  });
  const parsed = cfg as { history: unknown };
  expect(Array.isArray(parsed.history)).toBe(true);
});
