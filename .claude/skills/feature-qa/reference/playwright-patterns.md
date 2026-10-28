# Playwright patterns for feature-qa

## Setup when the project has none

```bash
npm i -D @playwright/test          # or pnpm add -D / yarn add -D — match the lockfile
npx playwright install chromium    # if offline/blocked: use channel 'chrome' below
```

`playwright.config.ts` (web app):

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/qa',
  retries: 0,                       // triage flakiness yourself; retries hide it
  reporter: [['list'], ['json', { outputFile: 'docs/qa/results.json' }], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4400', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm run dev -- --port 4400',   // or: build && npx serve dist -l 4400
    url: 'http://127.0.0.1:4400',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },   // add channel: 'chrome' if no bundled browser
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
```

## Adding a `qa` project to an existing config

```ts
// playwright.config.ts — append to projects; don't add a global webServer
{ name: 'qa', testMatch: 'qa/**/*.spec.ts', use: { channel: 'chrome', viewport: { width: 1440, height: 900 } } },
```

## Serving a static build without touching shared config

```ts
import { test as base } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

export const test = base.extend<{}, { siteURL: string }>({
  siteURL: [async ({}, use) => {
    const root = 'site/dist';
    const server: Server = createServer(async (req, res) => {
      let p = normalize(decodeURIComponent(new URL(req.url!, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
      if (p.endsWith('/')) p += 'index.html';
      try { const body = await readFile(join(root, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' }); res.end(body); }
      catch { res.writeHead(404); res.end(); }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as { port: number };
    await use(`http://127.0.0.1:${port}`);
    server.close();
  }, { scope: 'worker' }],
});
// in tests: await page.goto(`${siteURL}/interview/`)
```

## Fail any test that logs an error (with an allow-list)

```ts
import { test as base, expect } from '@playwright/test';

export const test = base.extend<{ allowErrors: RegExp[]; consoleGuard: void }>({
  allowErrors: [[], { option: true }],
  consoleGuard: [async ({ page, allowErrors }, use) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await use();
    expect(errors.filter((e) => !allowErrors.some((re) => re.test(e))), 'console/page errors').toEqual([]);
  }, { auto: true }],
});

// error-state test that expects a failed request:
test.describe(() => {
  test.use({ allowErrors: [/500/] });
  test('TC-27 shows an error card when data fails to load', async ({ page }) => { /* … */ });
});
```

## Case-id titles and known bugs

```ts
test('TC-03 Start is disabled until a topic is picked', async ({ page }) => { /* … */ });

test('TC-14 Save shows a confirmation toast', async ({ page }) => {
  // Added only AFTER this test was seen failing because the app shows no toast.
  test.fail(true, 'BUG-1: no confirmation after saving');
  // assert the CORRECT behaviour; flips to an unexpected pass once fixed
});
```

## Time, network, storage — never real waits

```ts
await page.clock.install();                 // before goto
await page.goto('/quiz');
await page.clock.fastForward('19:00');      // timers, countdowns, debounce

await page.route('**/api/items', (r) => r.fulfill({ status: 500 }));   // error state
await page.route('**/api/items', async (r) => { await new Promise((s) => setTimeout(s, 3000)); await r.continue(); }); // slow

await page.addInitScript(() => {            // storage unavailable
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
});
```

## Layout and accessibility basics

```ts
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
expect(overflow).toBeLessThanOrEqual(1);
// Full-page screenshots draw sticky/fixed elements in the wrong place —
// judge overlap from a viewport screenshot after scrolling, or with boundingBox().
```

```ts
await page.keyboard.press('Tab');
await expect(page.getByRole('button', { name: 'Start' })).toBeFocused();
```

## Electron apps

```ts
import { _electron as electron } from '@playwright/test';
const app = await electron.launch({ args: ['out/main/index.cjs'] });   // the built main entry
const page = await app.firstWindow();
// … same locators/assertions …
await app.close();
```

Packaged builds with hardened fuses can't be attached to — test the built (unpackaged) main entry.

## HTTP APIs

```ts
test('TC-20 rejects an empty title', async ({ request }) => {
  const r = await request.post('/api/todos', { data: { title: '' } });
  expect(r.status()).toBe(400);
});
```

## Evidence

```ts
await page.screenshot({ path: `docs/qa/${slug}/evidence/TC-05-results.png`, fullPage: true });
```

Run (writes all evidence in place, never wipes the shared `test-results/`):

```bash
PLAYWRIGHT_JSON_OUTPUT_NAME=docs/qa/<slug>/evidence/results.json \
PLAYWRIGHT_HTML_REPORT=docs/qa/<slug>/evidence/html-report \
npx playwright test --project=qa --repeat-each=3 \
  --reporter=list,json,html --output=docs/qa/<slug>/evidence/test-results
```
