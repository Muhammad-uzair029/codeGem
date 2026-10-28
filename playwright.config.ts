import { defineConfig } from '@playwright/test';

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
  projects: [
    {
      name: 'dev',
      testMatch: 'smoke.spec.ts',
    },
    {
      name: 'dev-full',
      testMatch: 'full.spec.ts',
    },
    {
      name: 'todos',
      testMatch: 'todos.spec.ts',
    },
    {
      name: 'flow',
      testMatch: 'flow.spec.ts',
    },
    {
      // Pure-Node unit tests for main/services/loopHelpers; no Electron.
      name: 'helpers',
      testMatch: 'loop-helpers.spec.ts',
    },
    {
      // Pure node: framework detection on temp folders (no Electron).
      name: 'detection',
      testMatch: 'detection.spec.ts',
    },
    {
      // feature-qa suites for the static site (site/dist, served by the spec itself).
      // Build first: cd site && npm run build. Uses installed Chrome.
      name: 'qa',
      testMatch: 'qa/**/*.spec.ts',
      use: { channel: 'chrome', viewport: { width: 1440, height: 900 }, screenshot: 'only-on-failure' },
    },
    {
      // Runs against the packaged .app bundle (requires pnpm pack:dir first).
      name: 'packaged',
      testMatch: 'packaged.spec.ts',
    },
  ],
});
