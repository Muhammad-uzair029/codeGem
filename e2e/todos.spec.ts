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
    args: [resolve(here, '..', 'out', 'main', 'index.cjs')],
    env: {
      ...process.env,
      ELECTRON_DISABLE_AUTO_UPDATE: '1',
    },
  });
  window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  // Ensure a clean starting state — clear any persisted todos + collapse flags.
  await window.evaluate(() => {
    localStorage.removeItem('flm:todos');
    localStorage.setItem('flm:collapse:todos', 'true');
  });
  await window.reload();
  await window.waitForLoadState('domcontentloaded');
  // Wait for the app past onboarding to fully mount the config rail.
  await window.locator('[data-testid="todo-list"]').waitFor({ state: 'visible', timeout: 30_000 });
});

test.afterAll(async () => {
  await app?.close();
});

test.describe('Todos feature', () => {
  test('renders the empty state when there are no todos', async () => {
    await expect(window.locator('[data-testid="todo-list"]')).toBeVisible();
    await expect(window.locator('[data-testid="todo-empty"]')).toBeVisible();
  });

  test('adds a todo via Enter key', async () => {
    const input = window.locator('[data-testid="todo-input"]');
    await input.fill('Write QA report');
    await input.press('Enter');

    const items = window.locator('[data-testid="todo-item"]');
    await expect(items).toHaveCount(1);
    await expect(items.first().locator('[data-testid="todo-text"]')).toHaveText('Write QA report');
    // Input clears after add.
    await expect(input).toHaveValue('');
    // Empty state gone.
    await expect(window.locator('[data-testid="todo-empty"]')).toHaveCount(0);
    // Counter shows 1 remaining / 1 total.
    await expect(window.locator('[data-testid="todo-remaining"]')).toHaveText('1 remaining · 1 total');
  });

  test('adds another todo via the + button', async () => {
    const input = window.locator('[data-testid="todo-input"]');
    await input.fill('Ship the release');
    await window.locator('[data-testid="todo-add"]').click();
    await expect(window.locator('[data-testid="todo-item"]')).toHaveCount(2);
    await expect(window.locator('[data-testid="todo-remaining"]')).toHaveText('2 remaining · 2 total');
  });

  test('trims whitespace and rejects empty input', async () => {
    const input = window.locator('[data-testid="todo-input"]');
    await input.fill('   ');
    const addBtn = window.locator('[data-testid="todo-add"]');
    await expect(addBtn).toBeDisabled();
    await input.press('Enter');
    await expect(window.locator('[data-testid="todo-item"]')).toHaveCount(2); // unchanged
    await input.fill('');
  });

  test('toggles a todo complete → strikethrough + counter updates', async () => {
    const firstItem = window.locator('[data-testid="todo-item"]').first();
    await firstItem.locator('[data-testid="todo-toggle"]').check();
    await expect(firstItem).toHaveAttribute('data-done', 'true');
    // Text gets line-through styling.
    const text = firstItem.locator('[data-testid="todo-text"]');
    await expect(text).toHaveClass(/line-through/);
    // Counter updates.
    await expect(window.locator('[data-testid="todo-remaining"]')).toHaveText('1 remaining · 2 total');
  });

  test('un-toggles a todo back to incomplete', async () => {
    const firstItem = window.locator('[data-testid="todo-item"]').first();
    await firstItem.locator('[data-testid="todo-toggle"]').uncheck();
    await expect(firstItem).toHaveAttribute('data-done', 'false');
    await expect(window.locator('[data-testid="todo-remaining"]')).toHaveText('2 remaining · 2 total');
  });

  test('persists todos across a reload', async () => {
    // Verify the two todos we added survive an app reload.
    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.locator('[data-testid="todo-item"]')).toHaveCount(2);
    const texts = await window.locator('[data-testid="todo-text"]').allTextContents();
    expect(texts).toEqual(['Write QA report', 'Ship the release']);
  });

  test('deletes a todo via the × button', async () => {
    const items = window.locator('[data-testid="todo-item"]');
    await items.first().hover();
    await items.first().locator('[data-testid="todo-delete"]').click({ force: true });
    await expect(items).toHaveCount(1);
    await expect(items.first().locator('[data-testid="todo-text"]')).toHaveText('Ship the release');
  });

  test('clears completed todos via the "Clear completed" action', async () => {
    // Mark the remaining todo done, then clear.
    const item = window.locator('[data-testid="todo-item"]').first();
    await item.locator('[data-testid="todo-toggle"]').check();
    await window.locator('[data-testid="todo-clear-completed"]').click();
    // Back to empty state.
    await expect(window.locator('[data-testid="todo-item"]')).toHaveCount(0);
    await expect(window.locator('[data-testid="todo-empty"]')).toBeVisible();
  });
});
