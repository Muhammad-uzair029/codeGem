import { defineConfig } from '@playwright/test';

// Playwright config for Electron smoke tests. We launch the packaged
// out/main/index.js via _electron.launch — no browser projects needed.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'on-first-retry',
  },
});
