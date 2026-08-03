import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [resolve(here, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      // Prevent auto-updater from firing during the test.
      ELECTRON_DISABLE_AUTO_UPDATE: '1',
    },
  });
  window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
});

test('renderer boots + shows the dashboard header', async () => {
  await expect(window.locator('text=Feature-Loop Manager').first()).toBeVisible();
  await expect(window.locator('text=Entry workspace controller')).toBeVisible();
});

test('preload exposes the full window.orchestrator surface', async () => {
  const api = await window.evaluate(() => {
    const o = (globalThis as unknown as { orchestrator?: Record<string, unknown> }).orchestrator;
    if (!o) return null;
    const shape = (obj: Record<string, unknown>): Record<string, string[]> =>
      Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [
          k,
          typeof v === 'object' && v !== null ? Object.keys(v as Record<string, unknown>) : [typeof v],
        ]),
      );
    return shape(o);
  });

  expect(api).not.toBeNull();
  expect(api!.workspace).toEqual(
    expect.arrayContaining([
      'pickExistingDir',
      'validateExisting',
      'pickParentDir',
      'defaultParentDir',
      'scaffoldNew',
      'detectFramework',
    ]),
  );
  expect(api!.inbox).toEqual(
    expect.arrayContaining(['writeBrief', 'briefExists', 'readDroppedFile']),
  );
  expect(api!.skills).toEqual(expect.arrayContaining(['inject']));
  expect(api!.loop).toEqual(
    expect.arrayContaining(['launch', 'stop', 'onChunk', 'onExit']),
  );
  expect(api!.state).toEqual(
    expect.arrayContaining(['read', 'setActive', 'clearActive']),
  );
  // This is the specific regression the v0.1.3 fix targets — the
  // File.path → webUtils.getPathForFile migration for Electron 32.
  expect(api!.util).toEqual(expect.arrayContaining(['getPathForFile']));
});

test('workspace tabs toggle between existing + new modes', async () => {
  const existingTab = window.locator('button[role="tab"]', { hasText: 'Existing' });
  const newTab = window.locator('button[role="tab"]', { hasText: 'New' });

  await expect(existingTab).toHaveAttribute('aria-selected', 'true');
  // The frameless-window layout can bounce briefly on first render — use
  // force: true so the click doesn't wait for a "stable" bounding box.
  await newTab.click({ force: true });
  await expect(newTab).toHaveAttribute('aria-selected', 'true');
  await expect(existingTab).toHaveAttribute('aria-selected', 'false');
  await existingTab.click({ force: true });
  await expect(existingTab).toHaveAttribute('aria-selected', 'true');
});

test('brief textarea accepts input but is disabled until workspace is picked', async () => {
  const textarea = window.locator('textarea[placeholder*="Feature: "]');
  await expect(textarea).toBeDisabled();
});

test('state.read returns a well-formed PersistentConfig', async () => {
  const cfg = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { state: { read: () => Promise<unknown> } };
    }).orchestrator;
    return o.state.read();
  });
  const parsed = cfg as {
    active_project_path: unknown;
    project_type: unknown;
    target_framework: unknown;
    history: unknown;
  };
  expect(parsed).toBeTruthy();
  expect(Array.isArray(parsed.history)).toBe(true);
});
