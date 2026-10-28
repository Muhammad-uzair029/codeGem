import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [resolve(here, '..', 'out', 'main', 'index.cjs')],
    env: {
      ...process.env,
      ELECTRON_DISABLE_AUTO_UPDATE: '1',
    },
  });
  window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await app?.close();
});

test('renderer boots + shows header', async () => {
  await expect(window.locator('text=Feature-Loop Manager').first()).toBeVisible();
});

test('preload exposes the full window.orchestrator surface including new v0.2 surfaces', async () => {
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
    expect.arrayContaining(['pickExistingDir', 'validateExisting', 'pickParentDir', 'defaultParentDir', 'scaffoldNew', 'detectFramework']),
  );
  expect(api!.inbox).toEqual(expect.arrayContaining(['writeBrief', 'briefExists', 'readDroppedFile']));
  expect(api!.skills).toEqual(expect.arrayContaining(['inject']));
  expect(api!.loop).toEqual(expect.arrayContaining(['launch', 'stop', 'onChunk', 'onExit']));
  expect(api!.state).toEqual(expect.arrayContaining(['read', 'setActive', 'clearActive', 'setLayout']));
  expect(api!.util).toEqual(expect.arrayContaining(['getPathForFile']));
  // v0.2 surfaces
  expect(api!.terminal).toEqual(expect.arrayContaining(['open', 'write', 'resize', 'close', 'onData', 'onExit']));
  expect(api!.explorer).toEqual(expect.arrayContaining(['readTree', 'openInVSCode', 'openInFinder', 'hasVSCodeCli']));
  expect(api!.shortcuts).toEqual(expect.arrayContaining(['onBrowseExisting', 'onToggleLeft', 'onQuickSwitch', 'onLaunch']));
});

test('three columns render in the layout', async () => {
  // Column headers injected by AppShell.
  const cols = window.locator('[class*="flex-col"][class*="h-full"]');
  await expect(cols.first()).toBeVisible();
  // Column title labels.
  await expect(window.locator('text=Config').first()).toBeVisible();
  await expect(window.locator('text=Terminal').first()).toBeVisible();
  await expect(window.locator('text=Explorer').first()).toBeVisible();
});

test('workspace tabs toggle between existing + new modes', async () => {
  const existingTab = window.locator('button[role="tab"]', { hasText: 'Existing' });
  const newTab = window.locator('button[role="tab"]', { hasText: 'New' });

  await expect(existingTab).toHaveAttribute('aria-selected', 'true');
  await newTab.click({ force: true });
  await expect(newTab).toHaveAttribute('aria-selected', 'true');
  await existingTab.click({ force: true });
  await expect(existingTab).toHaveAttribute('aria-selected', 'true');
});

test('brief textarea is disabled until a workspace is picked', async () => {
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

test('terminal:open rejects gracefully for invalid path', async () => {
  const result = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { terminal: { open: (req: { projectPath: string }) => Promise<unknown> } };
    }).orchestrator;
    return o.terminal.open({ projectPath: '/tmp/nonexistent-flm-test-path-xyz' });
  });
  // Either ok:true (shell still spawns) or ok:false — must not throw.
  expect(result).toBeDefined();
  expect(typeof (result as { ok: boolean }).ok).toBe('boolean');
});

test('explorer:hasVSCodeCli returns a boolean', async () => {
  const result = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { explorer: { hasVSCodeCli: () => Promise<boolean> } };
    }).orchestrator;
    return o.explorer.hasVSCodeCli();
  });
  expect(typeof result).toBe('boolean');
});
