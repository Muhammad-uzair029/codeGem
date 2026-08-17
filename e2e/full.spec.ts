/**
 * Full E2E suite — comprehensive coverage of every visible surface.
 *
 * Run with: pnpm test:e2e:full
 *
 * Covers:
 *  - Header & branding
 *  - Panel layout & resize handles
 *  - Left / right panel collapse + expand
 *  - CollapsibleSection toggle behaviour
 *  - ProjectSelector (Existing & New modes, fields, disabled states)
 *  - BriefIntake (disabled states, placeholders, Figma fields)
 *  - LaunchPanel (stage indicators, inject button)
 *  - StickyLaunchBar (launch button, gate reason)
 *  - Empty-center & empty-explorer states (no project selected)
 *  - API surface deep-checks via window.evaluate
 *  - Custom DOM event dispatch (flm:launch, flm:browseExisting, flm:quickSwitch)
 *  - loop.stop graceful rejection
 */

import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

let app: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    args: [resolve(here, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, ELECTRON_DISABLE_AUTO_UPDATE: '1' },
  });
  window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // ① Reset persisted collapsible-section state (localStorage).
  await window.evaluate(() => {
    ['project', 'brief', 'advanced'].forEach((k) =>
      localStorage.removeItem(`flm:collapse:${k}`),
    );
  });

  // ② Write a clean panel layout (both panels expanded) to config.json so the
  //    reloaded renderer starts with both side panels open, regardless of what
  //    a previous test run left behind.
  await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { state: { setLayout: (s: [number, number, number]) => Promise<unknown> } };
    }).orchestrator;
    await o.state.setLayout([28, 44, 28]);
  });

  // ③ Reload so the renderer picks up the clean layout from config.json.
  await window.reload();
  await window.waitForLoadState('domcontentloaded');
  // Give the app a moment to settle after reload.
  await window.waitForTimeout(800);
});

test.afterAll(async () => {
  await app?.close();
});

// ─── 1. Header & branding ────────────────────────────────────────────────────

test('header shows app title', async () => {
  await expect(window.locator('text=Feature-Loop Manager').first()).toBeVisible();
});

test('header shows subtitle', async () => {
  await expect(
    window.locator('text=claude-code-boilerplate orchestrator').first(),
  ).toBeVisible();
});

test('header version pill is visible and matches semver', async () => {
  const pill = window.locator('header .pill').first();
  await expect(pill).toBeVisible();
  const text = await pill.textContent();
  expect(text?.trim()).toMatch(/^v\d+\.\d+\.\d+$/);
});

// ─── 2. Panel layout ─────────────────────────────────────────────────────────

test('exactly two panel resize handles exist', async () => {
  const handles = window.locator('[data-panel-resize-handle-id]');
  await expect(handles).toHaveCount(2);
});

test('Config column header is visible', async () => {
  await expect(window.locator('text=Config').first()).toBeVisible();
});

test('Terminal column header is visible', async () => {
  await expect(window.locator('text=Terminal').first()).toBeVisible();
});

test('Explorer column header is visible', async () => {
  await expect(window.locator('text=Explorer').first()).toBeVisible();
});

// ─── 3. Left panel collapse / expand ─────────────────────────────────────────
//
// react-resizable-panels sets the collapsed panel to flex-basis:0 + overflow:hidden,
// so the Expand button lives in a 0-width container. We use { force: true } to
// dispatch click events directly on the element, bypassing visibility checks.

test('left panel collapses when collapse button is clicked', async () => {
  const collapseBtn = window.locator('button[title="Hide Config"]');
  await expect(collapseBtn).toBeVisible();
  await collapseBtn.click();
  // Conditional render: once collapsed, the Collapse button is removed from DOM.
  await expect(window.locator('button[title="Hide Config"]')).not.toBeAttached();
  // The Expand button is now in the 0-width panel (attached but not "visible").
  await expect(window.locator('button[title="Show Config"]')).toBeAttached();
});

test('left panel expands after being collapsed', async () => {
  // The Expand button lives in a 0-width panel (outside the Playwright viewport).
  // Bypass all viewport checks by firing a native DOM click directly.
  await window.evaluate(() => {
    document.querySelector<HTMLButtonElement>('button[title="Show Config"]')?.click();
  });
  await expect(window.locator('button[title="Hide Config"]')).toBeVisible();
  await expect(window.locator('text=1 · Project').first()).toBeVisible();
});

// ─── 4. Right panel collapse / expand ────────────────────────────────────────

test('right panel collapses when collapse button is clicked', async () => {
  const collapseBtn = window.locator('button[title="Hide Explorer"]');
  await expect(collapseBtn).toBeVisible();
  await collapseBtn.click();
  await expect(window.locator('button[title="Hide Explorer"]')).not.toBeAttached();
  await expect(window.locator('button[title="Show Explorer"]')).toBeAttached();
});

test('right panel expands after being collapsed', async () => {
  await window.evaluate(() => {
    document.querySelector<HTMLButtonElement>('button[title="Show Explorer"]')?.click();
  });
  await expect(window.locator('button[title="Hide Explorer"]')).toBeVisible();
});

// ─── 5. CollapsibleSection defaults & toggle ─────────────────────────────────
//
// The CollapsibleSection button text is "<Title>▲" or "<Title>▼", so we use
// /^Title/ (anchored start, no anchor end) to match without the arrow character.
// We also exclude the RecentProjects button (#recent-projects-btn) which also
// carries aria-expanded.

test('Project collapsible section is open by default', async () => {
  const btn = window
    .locator('button[aria-expanded]:not(#recent-projects-btn)')
    .filter({ hasText: /^Project/ });
  await expect(btn.first()).toHaveAttribute('aria-expanded', 'true');
});

test('Brief collapsible section is open by default', async () => {
  const btn = window
    .locator('button[aria-expanded]:not(#recent-projects-btn)')
    .filter({ hasText: /^Brief/ });
  await expect(btn.first()).toHaveAttribute('aria-expanded', 'true');
});

test('Advanced collapsible section is open by default', async () => {
  const btn = window
    .locator('button[aria-expanded]:not(#recent-projects-btn)')
    .filter({ hasText: /^Advanced/ });
  await expect(btn.first()).toHaveAttribute('aria-expanded', 'true');
});

test('CollapsibleSection collapses on click and re-expands on second click', async () => {
  const btn = window
    .locator('button[aria-expanded]:not(#recent-projects-btn)')
    .filter({ hasText: /^Project/ })
    .first();
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
});

// ─── 6. ProjectSelector — Existing mode ──────────────────────────────────────

test('project selector shows "1 · Project" heading', async () => {
  await expect(window.locator('text=1 · Project').first()).toBeVisible();
});

test('Existing tab is selected by default', async () => {
  const existingTab = window.locator('button[role="tab"]', { hasText: 'Existing' });
  await expect(existingTab).toHaveAttribute('aria-selected', 'true');
});

test('existing mode path input has correct placeholder', async () => {
  const input = window.locator('input[aria-label="Existing project absolute path"]');
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute('placeholder', '/absolute/path/to/existing/project');
});

test('existing mode path input is read-only', async () => {
  const input = window.locator('input[aria-label="Existing project absolute path"]');
  expect(await input.getAttribute('readonly')).not.toBeNull();
});

test('Browse button is visible in existing mode', async () => {
  await expect(window.locator('button', { hasText: 'Browse…' }).first()).toBeVisible();
});

// ─── 7. ProjectSelector — New mode ───────────────────────────────────────────

test('switching to New tab shows parent dir and project name fields', async () => {
  const newTab = window.locator('button[role="tab"]', { hasText: 'New' });
  await newTab.click({ force: true });
  await expect(newTab).toHaveAttribute('aria-selected', 'true');
  await expect(
    window.locator('input[aria-label="Parent directory for the new project"]'),
  ).toBeVisible();
  await expect(
    window.locator('input[aria-label="New project name (kebab-case)"]'),
  ).toBeVisible();
});

test('Create project button is disabled when fields are empty', async () => {
  const createBtn = window.locator('button', { hasText: 'Create project + git init' });
  await expect(createBtn).toBeDisabled();
});

test('Create project button enables when both parent dir and name are filled', async () => {
  const nameInput = window.locator('input[aria-label="New project name (kebab-case)"]');
  const parentInput = window.locator('input[aria-label="Parent directory for the new project"]');
  await nameInput.fill('test-project');
  await parentInput.fill('/tmp');
  await expect(window.locator('button', { hasText: 'Create project + git init' })).toBeEnabled();
  // Clean up so later tests see empty fields.
  await nameInput.fill('');
  await parentInput.fill('');
});

test('returning to Existing tab restores its mode', async () => {
  const existingTab = window.locator('button[role="tab"]', { hasText: 'Existing' });
  await existingTab.click({ force: true });
  await expect(existingTab).toHaveAttribute('aria-selected', 'true');
  await expect(
    window.locator('input[aria-label="Existing project absolute path"]'),
  ).toBeVisible();
});

// ─── 8. BriefIntake — no project ─────────────────────────────────────────────

test('"2 · Feature brief" heading is visible', async () => {
  await expect(window.locator('text=2 · Feature brief').first()).toBeVisible();
});

test('brief textarea is disabled without a project', async () => {
  await expect(window.locator('textarea[placeholder*="Feature: "]')).toBeDisabled();
});

test('brief textarea placeholder contains "Feature:"', async () => {
  const placeholder = await window
    .locator('textarea[placeholder*="Feature: "]')
    .getAttribute('placeholder');
  expect(placeholder).toContain('Feature:');
});

test('Figma design URL input is disabled without a project', async () => {
  await expect(window.locator('input[placeholder*="figma.com"]')).toBeDisabled();
});

test('Figma MCP URL input is disabled without a project', async () => {
  await expect(window.locator('input[placeholder*="127.0.0.1"]')).toBeDisabled();
});

test('"Write feature-brief.md" button is disabled without a project', async () => {
  await expect(window.locator('button', { hasText: 'Write feature-brief.md' })).toBeDisabled();
});

test('drop zone shows "Select a project first." without a project', async () => {
  await expect(window.locator('text=Select a project first.').first()).toBeVisible();
});

// ─── 9. LaunchPanel (Advanced section) ───────────────────────────────────────

test('Skills panel heading is visible', async () => {
  await expect(window.locator('.text-sm.font-semibold', { hasText: 'Skills' }).first()).toBeVisible();
});

test('Inject button is disabled without a valid project', async () => {
  // Button text is now dynamic: "Inject N skill(s)" — matches all forms.
  const btn = window.locator('button', { hasText: /^Inject \d+ skill/ }).first();
  const alt = window.locator('text=Select a valid project first');
  // If cache is empty the button doesn't render at all; the gate message is shown instead.
  if (await btn.count() > 0) {
    await expect(btn).toBeDisabled();
  } else {
    await expect(alt.first()).toBeVisible();
  }
});

test('all 5 loop stage indicators render', async () => {
  for (const stage of ['Intake', 'Spec', 'Implement', 'Verify', 'Learn']) {
    await expect(window.locator(`text=${stage}`).first()).toBeVisible();
  }
});

// ─── 10. StickyLaunchBar ─────────────────────────────────────────────────────

test('launch button is present', async () => {
  await expect(window.locator('[data-testid="launch-btn"]')).toBeVisible();
});

test('launch button is disabled without a project', async () => {
  await expect(window.locator('[data-testid="launch-btn"]')).toBeDisabled();
});

test('launch button shows "Launch Autonomous Loop" initially', async () => {
  await expect(window.locator('[data-testid="launch-btn"]')).toContainText('Launch Autonomous Loop');
});

test('gate reason "Select a valid project first." is visible below launch button', async () => {
  await expect(window.locator('text=Select a valid project first.').first()).toBeVisible();
});

// ─── 11. Empty-center state (no project) ─────────────────────────────────────

test('center column shows empty state without a project', async () => {
  await expect(
    window.locator('text=Pick a project on the left to begin.').first(),
  ).toBeVisible();
});

// ─── 12. Explorer empty state (no project) ───────────────────────────────────

test('explorer shows "No project selected." without a project', async () => {
  await expect(window.locator('text=No project selected.').first()).toBeVisible();
});

// ─── 13. Preload API — top-level namespace keys ───────────────────────────────

test('window.orchestrator exposes all top-level namespaces', async () => {
  const keys = await window.evaluate(() =>
    Object.keys(
      (globalThis as unknown as { orchestrator: Record<string, unknown> }).orchestrator,
    ),
  );
  expect(keys).toEqual(
    expect.arrayContaining([
      'workspace', 'inbox', 'skills', 'loop', 'state',
      'terminal', 'explorer', 'shortcuts', 'util',
    ]),
  );
});

// ─── 14. API — workspace ─────────────────────────────────────────────────────

test('workspace.defaultParentDir returns a non-empty string', async () => {
  const result = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { workspace: { defaultParentDir: () => Promise<string> } };
    }).orchestrator;
    return o.workspace.defaultParentDir();
  });
  expect(typeof result).toBe('string');
  expect((result as string).length).toBeGreaterThan(0);
});

test('workspace.validateExisting returns correct shape for /tmp', async () => {
  const result = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { workspace: { validateExisting: (p: string) => Promise<unknown> } };
    }).orchestrator;
    return o.workspace.validateExisting('/tmp');
  });
  const v = result as { ok: boolean; path: string; hasGit: boolean; hasPackageJson: boolean; hasClaudeDir: boolean };
  expect(typeof v.ok).toBe('boolean');
  expect(typeof v.path).toBe('string');
  expect(typeof v.hasGit).toBe('boolean');
  expect(typeof v.hasPackageJson).toBe('boolean');
  expect(typeof v.hasClaudeDir).toBe('boolean');
});

test('workspace.validateExisting returns ok:false for a nonexistent path', async () => {
  const result = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { workspace: { validateExisting: (p: string) => Promise<{ ok: boolean }> } };
    }).orchestrator;
    return o.workspace.validateExisting('/tmp/nonexistent-flm-e2e-test-xyz');
  });
  expect((result as { ok: boolean }).ok).toBe(false);
});

test('workspace.detectFramework returns FrameworkDetection shape', async () => {
  const result = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { workspace: { detectFramework: (p: string) => Promise<unknown> } };
    }).orchestrator;
    return o.workspace.detectFramework('/tmp');
  });
  const det = result as { framework: unknown; signals: unknown[] };
  expect(Object.prototype.hasOwnProperty.call(det, 'framework')).toBe(true);
  expect(Array.isArray(det.signals)).toBe(true);
});

// ─── 15. API — inbox ─────────────────────────────────────────────────────────

test('inbox.briefExists returns a boolean for any path', async () => {
  const result = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { inbox: { briefExists: (p: string) => Promise<boolean> } };
    }).orchestrator;
    return o.inbox.briefExists('/tmp/no-such-project-flm-e2e');
  });
  expect(typeof result).toBe('boolean');
});

// ─── 16. API — explorer ──────────────────────────────────────────────────────

test('explorer.hasVSCodeCli returns a boolean', async () => {
  const result = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { explorer: { hasVSCodeCli: () => Promise<boolean> } };
    }).orchestrator;
    return o.explorer.hasVSCodeCli();
  });
  expect(typeof result).toBe('boolean');
});

test('explorer.readTree returns ExplorerReadTreeResult shape for an invalid path', async () => {
  const result = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { explorer: { readTree: (p: string) => Promise<unknown> } };
    }).orchestrator;
    return o.explorer.readTree('/tmp/nonexistent-flm-tree-e2e-xyz');
  });
  const r = result as { ok: boolean; tree: unknown[] };
  expect(typeof r.ok).toBe('boolean');
  expect(Array.isArray(r.tree)).toBe(true);
});

test('explorer.readTree on a real dir returns ok:true', async () => {
  const result = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { explorer: { readTree: (p: string) => Promise<{ ok: boolean; tree: unknown[] }> } };
    }).orchestrator;
    return o.explorer.readTree('/tmp');
  });
  expect((result as { ok: boolean }).ok).toBe(true);
});

// ─── 17. API — state ─────────────────────────────────────────────────────────

test('state.read returns a well-formed PersistentConfig', async () => {
  const result = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { state: { read: () => Promise<unknown> } };
    }).orchestrator;
    return o.state.read();
  });
  const cfg = result as { active_project_path: unknown; history: unknown[] };
  expect(result).toBeTruthy();
  expect(Array.isArray(cfg.history)).toBe(true);
});

test('state.setLayout resolves without throwing', async () => {
  const result = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { state: { setLayout: (s: [number, number, number]) => Promise<unknown> } };
    }).orchestrator;
    return o.state.setLayout([28, 44, 28]);
  });
  expect(result).toBeDefined();
});

test('state.clearActive resolves and returns a config shape', async () => {
  const result = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { state: { clearActive: () => Promise<unknown> } };
    }).orchestrator;
    return o.state.clearActive();
  });
  const cfg = result as { history: unknown[] };
  expect(Array.isArray(cfg.history)).toBe(true);
});

// ─── 18. API — terminal ──────────────────────────────────────────────────────

test('terminal.open rejects gracefully for a nonexistent path', async () => {
  const result = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { terminal: { open: (req: { projectPath: string }) => Promise<unknown> } };
    }).orchestrator;
    return o.terminal.open({ projectPath: '/tmp/nonexistent-flm-term-e2e' });
  });
  expect(result).toBeDefined();
  expect(typeof (result as { ok: boolean }).ok).toBe('boolean');
});

// ─── 19. API — loop ──────────────────────────────────────────────────────────

test('loop.stop on a fake sessionId resolves without throwing', async () => {
  const result = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { loop: { stop: (id: string) => Promise<{ ok: boolean }> } };
    }).orchestrator;
    return o.loop.stop('fake-session-id-flm-e2e-test');
  });
  expect(result).toBeDefined();
  expect(typeof (result as { ok: boolean }).ok).toBe('boolean');
});

// ─── 20. API — util ──────────────────────────────────────────────────────────

test('util.getPathForFile is a function', async () => {
  const isFunction = await window.evaluate(() => {
    const o = (globalThis as unknown as { orchestrator: { util: Record<string, unknown> } }).orchestrator;
    return typeof o.util.getPathForFile === 'function';
  });
  expect(isFunction).toBe(true);
});

// ─── 21. Custom DOM events — no-crash guarantee ──────────────────────────────

test('dispatching flm:launch event does not throw', async () => {
  const threw = await window.evaluate(() => {
    try { window.dispatchEvent(new CustomEvent('flm:launch')); return false; }
    catch { return true; }
  });
  expect(threw).toBe(false);
});

test('dispatching flm:browseExisting event does not throw', async () => {
  const threw = await window.evaluate(() => {
    try { window.dispatchEvent(new CustomEvent('flm:browseExisting')); return false; }
    catch { return true; }
  });
  expect(threw).toBe(false);
});

test('dispatching flm:quickSwitch event does not throw', async () => {
  const threw = await window.evaluate(() => {
    try { window.dispatchEvent(new CustomEvent('flm:quickSwitch')); return false; }
    catch { return true; }
  });
  expect(threw).toBe(false);
});

// ─── 22. Shortcuts surface ───────────────────────────────────────────────────

test('shortcuts namespace exposes all four listener registrars', async () => {
  const keys = await window.evaluate(() => {
    const o = (globalThis as unknown as { orchestrator: { shortcuts: Record<string, unknown> } }).orchestrator;
    return Object.keys(o.shortcuts);
  });
  expect(keys).toEqual(
    expect.arrayContaining(['onBrowseExisting', 'onToggleLeft', 'onQuickSwitch', 'onLaunch']),
  );
});

test('each shortcut listener returns a cleanup function', async () => {
  const allFunctions = await window.evaluate(() => {
    const s = (globalThis as unknown as {
      orchestrator: {
        shortcuts: {
          onBrowseExisting: (cb: () => void) => unknown;
          onToggleLeft: (cb: () => void) => unknown;
          onQuickSwitch: (cb: () => void) => unknown;
          onLaunch: (cb: () => void) => unknown;
        };
      };
    }).orchestrator.shortcuts;
    const noop = () => {};
    return [
      typeof s.onBrowseExisting(noop),
      typeof s.onToggleLeft(noop),
      typeof s.onQuickSwitch(noop),
      typeof s.onLaunch(noop),
    ];
  });
  expect(allFunctions.every((t) => t === 'function')).toBe(true);
});
