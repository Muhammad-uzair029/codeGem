/**
 * End-to-end flow test — drives the actual project lifecycle via IPC.
 *
 * Each test is self-contained: creates its own temp workspace, verifies,
 * cleans up. No cross-test state.
 *
 * Covers:
 *   1. Scaffold NEW project → verify files on disk (git, package.json)
 *   2. validateExisting on scaffolded project → ok:true
 *   3. setActive + state.read roundtrip
 *   4. Terminal PTY spawn + echo roundtrip in scaffolded project
 *   5. Load EXISTING project (codeGem repo itself)
 *   6. Skills injection (skips gracefully if cache is empty)
 *   7. Screenshots of loaded-project + Todos states
 */

import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'test-results');
const repoRoot = resolve(here, '..');

let app: ElectronApplication;
let window: Page;

// Helpers -------------------------------------------------------------------

function freshParent(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `flm-flow-${prefix}-`));
}

async function scaffold(name: string): Promise<{ parent: string; path: string }> {
  const parent = freshParent(name);
  const path = await window.evaluate(
    async ({ p, n }) => {
      const o = (globalThis as unknown as {
        orchestrator: {
          workspace: {
            scaffoldNew: (req: { parentDir: string; projectName: string }) => Promise<{
              ok: boolean; path: string; reason?: string;
            }>;
          };
        };
      }).orchestrator;
      const r = await o.workspace.scaffoldNew({ parentDir: p, projectName: n });
      if (!r.ok) throw new Error(r.reason ?? 'scaffoldNew failed');
      return r.path;
    },
    { p: parent, n: name },
  );
  return { parent, path };
}

// The app downloads skills from the skills site. Serve the locally built
// site (site/dist) so the test exercises the real manifest + files.
const siteDist = resolve(here, '..', 'site', 'dist');
let siteServer: Server | undefined;
let siteUrl = '';

test.beforeAll(async () => {
  if (!existsSync(join(siteDist, 'manifest.json'))) {
    throw new Error(`site/dist not built — run: cd site && npm run build`);
  }
  siteServer = createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (p.split('/').includes('..')) { res.writeHead(400); res.end(); return; }
    try {
      res.writeHead(200);
      res.end(await readFile(join(siteDist, p.endsWith('/') ? `${p}index.html` : p)));
    } catch {
      res.writeHead(404); res.end();
    }
  });
  await new Promise<void>((r) => siteServer!.listen(0, '127.0.0.1', r));
  siteUrl = `http://127.0.0.1:${(siteServer.address() as { port: number }).port}`;

  app = await electron.launch({
    args: [resolve(here, '..', 'out', 'main', 'index.cjs')],
    env: { ...process.env, ELECTRON_DISABLE_AUTO_UPDATE: '1', CODEGEM_SKILLS_URL: siteUrl },
  });
  window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(1200); // let onboarding gate settle
});

test.afterAll(async () => {
  // Clear active project so subsequent test runs (e.g. full.spec.ts) start clean.
  try {
    await window.evaluate(async () => {
      const o = (globalThis as unknown as {
        orchestrator: { state: { clearActive: () => Promise<unknown> } };
      }).orchestrator;
      await o.state.clearActive();
    });
  } catch {/* app may already be closed */}
  await app?.close();
  siteServer?.close();
});

// ─── 1. NEW PROJECT flow ─────────────────────────────────────────────────────

test('scaffoldNew creates a project with git + package.json + README', async () => {
  const { parent, path } = await scaffold('scaffold');
  try {
    expect(existsSync(path)).toBe(true);
    expect(existsSync(join(path, '.git'))).toBe(true);
    expect(existsSync(join(path, 'package.json'))).toBe(true);
    expect(existsSync(join(path, 'README.md'))).toBe(true);
    // package.json is valid JSON with expected shape.
    const pkg = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')) as {
      name: string; scripts: Record<string, string>;
    };
    expect(pkg.name).toBe('scaffold');
    expect(pkg.scripts.dev).toBeDefined();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('scaffoldNew rejects invalid project names', async () => {
  const result = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: {
        workspace: {
          scaffoldNew: (req: { parentDir: string; projectName: string }) => Promise<{
            ok: boolean; reason?: string;
          }>;
        };
      };
    }).orchestrator;
    return o.workspace.scaffoldNew({ parentDir: '/tmp', projectName: 'Not Valid!' });
  });
  expect(result.ok).toBe(false);
  expect(result.reason).toContain('kebab-case');
});

// ─── 2. VALIDATE + STATE flow ────────────────────────────────────────────────

test('validate + setActive + state.read roundtrip for a scaffolded project', async () => {
  const { parent, path } = await scaffold('validate');
  try {
    const round = await window.evaluate(async (p) => {
      const o = (globalThis as unknown as {
        orchestrator: {
          workspace: { validateExisting: (p: string) => Promise<unknown> };
          state: {
            setActive: (patch: {
              active_project_path: string;
              project_type: string;
              target_framework: string | null;
            }) => Promise<unknown>;
            read: () => Promise<unknown>;
          };
        };
      }).orchestrator;
      const v = await o.workspace.validateExisting(p);
      const set = await o.state.setActive({
        active_project_path: p,
        project_type: 'NEW_SCAFFOLD',
        target_framework: null,
      });
      const read = await o.state.read();
      return { v, set, read };
    }, path);

    const v = round.v as { ok: boolean; hasGit: boolean; hasPackageJson: boolean };
    expect(v.ok).toBe(true);
    expect(v.hasGit).toBe(true);
    expect(v.hasPackageJson).toBe(true);
    const read = round.read as { active_project_path: string | null };
    expect(read.active_project_path).toBe(path);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

// ─── 3. TERMINAL PTY roundtrip ───────────────────────────────────────────────

test('terminal spawns a PTY in the scaffolded project and echoes output', async () => {
  const { parent, path } = await scaffold('terminal');
  try {
    const opened = await window.evaluate(async (p) => {
      const o = (globalThis as unknown as {
        orchestrator: {
          terminal: { open: (req: { projectPath: string }) => Promise<{ ok: boolean; sessionId: string; reason?: string }> };
        };
      }).orchestrator;
      return o.terminal.open({ projectPath: p });
    }, path);
    expect(opened.ok).toBe(true);

    const buf = await window.evaluate(async (sid) => {
      const o = (globalThis as unknown as {
        orchestrator: {
          terminal: {
            write: (r: { sessionId: string; data: string }) => Promise<void>;
            onData: (cb: (e: { sessionId: string; data: string }) => void) => () => void;
            close: (sid: string) => Promise<unknown>;
          };
        };
      }).orchestrator;
      return new Promise<string>((res) => {
        let out = '';
        const off = o.terminal.onData((e) => { if (e.sessionId === sid) out += e.data; });
        void o.terminal.write({ sessionId: sid, data: 'echo READY_' + 'MARKER\r' });
        setTimeout(async () => { off(); await o.terminal.close(sid); res(out); }, 1500);
      });
    }, opened.sessionId);

    expect(buf).toContain('READY_MARKER');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

// ─── 4. EXISTING PROJECT flow (codeGem repo) ─────────────────────────────────

test('validateExisting on the codeGem repo returns ok:true with all signals', async () => {
  const v = await window.evaluate(async (p) => {
    const o = (globalThis as unknown as {
      orchestrator: {
        workspace: {
          validateExisting: (p: string) => Promise<{
            ok: boolean; hasGit: boolean; hasPackageJson: boolean; hasClaudeDir: boolean;
          }>;
        };
      };
    }).orchestrator;
    return o.workspace.validateExisting(p);
  }, repoRoot);
  expect(v.ok).toBe(true);
  expect(v.hasGit).toBe(true);
  expect(v.hasPackageJson).toBe(true);
  expect(v.hasClaudeDir).toBe(true);
});

test('detectFramework on the codeGem repo returns a shape', async () => {
  const det = await window.evaluate(async (p) => {
    const o = (globalThis as unknown as {
      orchestrator: { workspace: { detectFramework: (p: string) => Promise<{ framework: unknown; signals: unknown[] }> } };
    }).orchestrator;
    return o.workspace.detectFramework(p);
  }, repoRoot);
  expect(Object.prototype.hasOwnProperty.call(det, 'framework')).toBe(true);
  expect(Array.isArray(det.signals)).toBe(true);
});

test('explorer.readTree returns the codeGem file tree', async () => {
  const r = await window.evaluate(async (p) => {
    const o = (globalThis as unknown as {
      orchestrator: { explorer: { readTree: (p: string) => Promise<{ ok: boolean; tree: unknown[] }> } };
    }).orchestrator;
    return o.explorer.readTree(p);
  }, repoRoot);
  expect(r.ok).toBe(true);
  expect(r.tree.length).toBeGreaterThan(5);
});

test('history grows when a new project is set active', async () => {
  const { parent, path } = await scaffold('history');
  try {
    const cfg = await window.evaluate(async (p) => {
      const o = (globalThis as unknown as {
        orchestrator: {
          state: {
            setActive: (patch: {
              active_project_path: string;
              project_type: string;
              target_framework: string | null;
            }) => Promise<{ history: Array<{ active_project_path: string }> }>;
          };
        };
      }).orchestrator;
      return o.state.setActive({
        active_project_path: p,
        project_type: 'NEW_SCAFFOLD',
        target_framework: null,
      });
    }, path);
    expect(cfg.history.some((h) => h.active_project_path === path)).toBe(true);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

// ─── 4b. SKILLS DOWNLOAD from the skills site ────────────────────────────────

test('skillsRemote.installAll downloads every skill from the skills site', async () => {
  test.setTimeout(60_000);
  const siteManifest = JSON.parse(readFileSync(join(siteDist, 'manifest.json'), 'utf8')) as {
    skills: { name: string }[];
  };
  const result = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: {
        skillsRemote: {
          installAll: () => Promise<{ ok: boolean; count: number; reason?: string }>;
          status: () => Promise<{ installed: boolean; count: number; skills: string[] }>;
        };
      };
    }).orchestrator;
    const install = await o.skillsRemote.installAll();
    const status = await o.skillsRemote.status();
    return { install, status };
  });
  expect(result.install.ok, result.install.reason).toBe(true);
  // The cache mirrors the site exactly — same skills, nothing stale left over.
  expect(result.install.count).toBe(siteManifest.skills.length);
  expect(result.status.installed).toBe(true);
  expect([...result.status.skills].sort()).toEqual(siteManifest.skills.map((s) => s.name).sort());
  expect(result.status.skills).toContain('feature-qa');
});

// ─── 5. SKILLS injection ─────────────────────────────────────────────────────

test('skills injection into a scaffolded project (skipped if cache empty)', async () => {
  const status = await window.evaluate(async () => {
    const o = (globalThis as unknown as {
      orchestrator: { skillsRemote: { status: () => Promise<{ installed: boolean; count: number }> } };
    }).orchestrator;
    return o.skillsRemote.status();
  });
  test.skip(
    !status.installed || status.count === 0,
    `Skills cache is empty (count=${status.count}). Run onboarding or Settings → Install All first.`,
  );

  const { parent, path } = await scaffold('skills');
  try {
    const result = await window.evaluate(async (p) => {
      const o = (globalThis as unknown as {
        orchestrator: {
          skills: {
            inject: (req: { targetPath: string; overwrite?: boolean }) => Promise<{
              ok: boolean; skillsCopied: number; claudeMdWritten: boolean; reason?: string;
            }>;
            listInProject: (p: string) => Promise<string[]>;
          };
        };
      }).orchestrator;
      const inj = await o.skills.inject({ targetPath: p, overwrite: true });
      const list = await o.skills.listInProject(p);
      return { inj, list };
    }, path);
    expect(result.inj.ok).toBe(true);
    expect(result.inj.skillsCopied).toBeGreaterThan(0);
    expect(existsSync(join(path, '.claude', 'skills'))).toBe(true);
    expect(existsSync(join(path, 'CLAUDE.md'))).toBe(true);
    expect(result.list.length).toBeGreaterThan(0);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

// ─── 6. SCREENSHOTS ──────────────────────────────────────────────────────────

test('screenshot: full app with a project loaded', async () => {
  const { parent, path } = await scaffold('screenshot');
  try {
    await window.evaluate(async (p) => {
      const o = (globalThis as unknown as {
        orchestrator: {
          state: {
            setActive: (patch: {
              active_project_path: string;
              project_type: string;
              target_framework: string | null;
            }) => Promise<unknown>;
          };
        };
      }).orchestrator;
      await o.state.setActive({
        active_project_path: p,
        project_type: 'NEW_SCAFFOLD',
        target_framework: null,
      });
    }, path);
    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await window.locator('text=Feature-Loop Manager').first().waitFor({ state: 'visible', timeout: 30_000 });
    await window.waitForTimeout(1500); // let terminal + explorer settle
    await window.screenshot({ path: join(outDir, 'flow-project-loaded.png'), fullPage: false });
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('screenshot: Todos feature with seeded items', async () => {
  await window.evaluate(() => {
    localStorage.setItem(
      'flm:todos',
      JSON.stringify([
        { id: 'a', text: 'Wire up onboarding gate', done: true },
        { id: 'b', text: 'Add mic dictation for terminal', done: false },
        { id: 'c', text: 'Draft QA report', done: false },
      ]),
    );
    localStorage.setItem('flm:collapse:todos', 'true');
  });
  await window.reload();
  await window.waitForLoadState('domcontentloaded');
  await window.locator('[data-testid="todo-list"]').waitFor({ state: 'visible', timeout: 30_000 });
  await window.locator('[data-testid="todo-list"]').scrollIntoViewIfNeeded();
  await window.waitForTimeout(300);
  const section = window.locator('text=TODOS').locator('xpath=./ancestor::div[1]/parent::div');
  await section.screenshot({ path: join(outDir, 'flow-todos.png') });
});
