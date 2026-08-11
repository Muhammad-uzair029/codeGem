# Skills Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the public boilerplate GitHub repo so that on first launch the user sees a skill-selection onboarding screen, and can update skills at any time from the Advanced settings panel.

**Architecture:** A new `skillsRemoteService.ts` in the main process downloads a ZIP from `codeload.github.com`, extracts selected skills to `userData/boilerplate/`, and writes a `meta.json` manifest. `pathService.ts` is updated to check that userData cache first. The renderer gets an `<Onboarding />` screen gated by whether `meta.json` exists, and a `<SkillsUpdater />` component in the Advanced collapsible for on-demand updates.

**Tech Stack:** Electron main process (Node.js), `adm-zip` for ZIP extraction, React + Tailwind for UI, Sonner for toasts, existing IPC/contextBridge patterns.

## Global Constraints

- ZIP endpoint: `https://codeload.github.com/Muhammad-uzair029/claude-code-boilerplate/zip/refs/heads/main` — no auth required
- Skills cached to: `userData/boilerplate/.claude/skills/<name>/`
- Meta file: `userData/boilerplate/meta.json` — `{ downloadedAt: string, ref: "main", skills: string[] }`
- `userData/boilerplate/` is highest-priority path in `pathService.ts` (checked before `resourcesPath`)
- On partial extract failure: roll back (delete partial `userData/boilerplate/`) and report error
- Skill description = first non-empty line of `SKILL.md` after any YAML frontmatter `---` block, or folder name if no SKILL.md
- "Skip for now" on onboarding writes a `meta.json` with `{ skills: [], skipped: true }` so the gate doesn't re-trigger

---

### Task 1: IPC Types

**Files:**
- Modify: `src/shared/ipc.ts`

**Interfaces:**
- Produces: `SkillInfo`, `SkillsRemoteListResult`, `SkillsInstallResult`, `SkillsCacheStatus` types; `skillsRemote` namespace on `OrchestratorApi`

- [ ] **Step 1: Add new types to `src/shared/ipc.ts`**

In `src/shared/ipc.ts`, add after the `SkillInjectionResult` interface:

```typescript
export interface SkillInfo {
  name: string;
  description: string;
}

export interface SkillsRemoteListResult {
  ok: boolean;
  skills: SkillInfo[];
  reason?: string;
}

export interface SkillsInstallResult {
  ok: boolean;
  count: number;
  reason?: string;
}

export interface SkillsCacheStatus {
  installed: boolean;
  downloadedAt: string | null;
  count: number;
  skills: string[];
  skipped: boolean;
}
```

- [ ] **Step 2: Add `skillsRemote` namespace to `OrchestratorApi`**

In the `OrchestratorApi` interface in `src/shared/ipc.ts`, add after the `skills` property:

```typescript
  skillsRemote: {
    fetchList: () => Promise<SkillsRemoteListResult>;
    install: (names: string[]) => Promise<SkillsInstallResult>;
    installAll: () => Promise<SkillsInstallResult>;
    status: () => Promise<SkillsCacheStatus>;
    skip: () => Promise<void>;
  };
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no new errors — the new namespace has no implementation yet, types only)

---

### Task 2: Install adm-zip

**Files:**
- `package.json` (updated by pnpm)
- `pnpm-lock.yaml` (updated by pnpm)

**Interfaces:**
- Produces: `adm-zip` and `@types/adm-zip` available for import in main process

- [ ] **Step 1: Install packages**

```bash
pnpm add adm-zip
pnpm add -D @types/adm-zip
```

- [ ] **Step 2: Verify install**

Run: `node -e "const AdmZip = require('adm-zip'); console.log('ok')"`
Expected: `ok`

---

### Task 3: Create `skillsRemoteService.ts`

**Files:**
- Create: `src/main/services/skillsRemoteService.ts`

**Interfaces:**
- Consumes: `SkillInfo`, `SkillsRemoteListResult`, `SkillsInstallResult`, `SkillsCacheStatus` from `@shared/ipc`; `userDataPath()` from `./pathService.js`
- Produces: `registerSkillsRemoteIpc()` function exported for use in `index.ts`

- [ ] **Step 1: Create the file**

Create `src/main/services/skillsRemoteService.ts`:

```typescript
import { ipcMain } from 'electron';
import AdmZip from 'adm-zip';
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  SkillInfo,
  SkillsRemoteListResult,
  SkillsInstallResult,
  SkillsCacheStatus,
} from '@shared/ipc';
import { userDataPath } from './pathService.js';

const ZIP_URL =
  'https://codeload.github.com/Muhammad-uzair029/claude-code-boilerplate/zip/refs/heads/main';

function boilerplateCacheDir(): string {
  return join(userDataPath(), 'boilerplate');
}

function metaPath(): string {
  return join(boilerplateCacheDir(), 'meta.json');
}

interface Meta {
  downloadedAt: string;
  ref: string;
  skills: string[];
  skipped?: boolean;
}

function readMeta(): Meta | null {
  try {
    return JSON.parse(readFileSync(metaPath(), 'utf8')) as Meta;
  } catch {
    return null;
  }
}

function writeMeta(meta: Meta): void {
  mkdirSync(boilerplateCacheDir(), { recursive: true });
  writeFileSync(metaPath(), JSON.stringify(meta, null, 2));
}

function parseSkillDescription(zip: AdmZip, topFolder: string, skillName: string): string {
  const skillMdPath = `${topFolder}.claude/skills/${skillName}/SKILL.md`;
  const entry = zip.getEntry(skillMdPath);
  if (!entry) return skillName;
  const content = entry.getData().toString('utf8');
  const lines = content.split('\n');
  let inFrontmatter = false;
  let frontmatterDone = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!frontmatterDone && trimmed === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
        continue;
      } else {
        frontmatterDone = true;
        continue;
      }
    }
    if (inFrontmatter && !frontmatterDone) continue;
    if (trimmed) return trimmed.replace(/^#+\s*/, '');
  }
  return skillName;
}

async function downloadZip(): Promise<AdmZip> {
  const response = await fetch(ZIP_URL);
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return new AdmZip(Buffer.from(buffer));
}

function getTopFolder(zip: AdmZip): string {
  const entries = zip.getEntries();
  for (const entry of entries) {
    const parts = entry.entryName.split('/');
    if (parts.length >= 2 && parts[1] === '.claude') {
      return `${parts[0]}/`;
    }
  }
  // fallback: first directory segment
  const first = entries[0];
  if (first) return `${first.entryName.split('/')[0]}/`;
  throw new Error('Could not locate top-level folder in ZIP');
}

function listSkillsInZip(zip: AdmZip, topFolder: string): string[] {
  const prefix = `${topFolder}.claude/skills/`;
  const names = new Set<string>();
  for (const entry of zip.getEntries()) {
    if (entry.entryName.startsWith(prefix)) {
      const rest = entry.entryName.slice(prefix.length);
      const name = rest.split('/')[0];
      if (name) names.add(name);
    }
  }
  return [...names].sort();
}

function extractSkills(zip: AdmZip, topFolder: string, names: string[]): void {
  const cacheDir = boilerplateCacheDir();
  const skillsDir = join(cacheDir, '.claude', 'skills');

  for (const name of names) {
    const prefix = `${topFolder}.claude/skills/${name}/`;
    for (const entry of zip.getEntries()) {
      if (!entry.entryName.startsWith(prefix) || entry.isDirectory) continue;
      const relativePath = entry.entryName.slice(prefix.length);
      const destPath = join(skillsDir, name, relativePath);
      mkdirSync(dirname(destPath), { recursive: true });
      writeFileSync(destPath, entry.getData());
    }
  }

  // Copy CLAUDE.md
  const claudeMdEntry = zip.getEntry(`${topFolder}.claude/CLAUDE.md`);
  if (claudeMdEntry) {
    const claudeDir = join(cacheDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'CLAUDE.md'), claudeMdEntry.getData().toString('utf8'));
  }
}

export function registerSkillsRemoteIpc(): void {
  ipcMain.handle('skillsRemote:fetchList', async (): Promise<SkillsRemoteListResult> => {
    try {
      const zip = await downloadZip();
      const topFolder = getTopFolder(zip);
      const names = listSkillsInZip(zip, topFolder);
      const skills: SkillInfo[] = names.map((name) => ({
        name,
        description: parseSkillDescription(zip, topFolder, name),
      }));
      return { ok: true, skills };
    } catch (err) {
      return {
        ok: false,
        skills: [],
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle(
    'skillsRemote:install',
    async (_evt, names: string[]): Promise<SkillsInstallResult> => {
      const cacheDir = boilerplateCacheDir();
      try {
        const zip = await downloadZip();
        const topFolder = getTopFolder(zip);
        // Roll back on failure
        const skillsDir = join(cacheDir, '.claude', 'skills');
        try {
          extractSkills(zip, topFolder, names);
        } catch (err) {
          if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
          throw err;
        }
        writeMeta({
          downloadedAt: new Date().toISOString(),
          ref: 'main',
          skills: names,
        });
        const count = existsSync(skillsDir)
          ? readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length
          : 0;
        return { ok: true, count };
      } catch (err) {
        return {
          ok: false,
          count: 0,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle('skillsRemote:installAll', async (): Promise<SkillsInstallResult> => {
    const cacheDir = boilerplateCacheDir();
    try {
      const zip = await downloadZip();
      const topFolder = getTopFolder(zip);
      const names = listSkillsInZip(zip, topFolder);
      const skillsDir = join(cacheDir, '.claude', 'skills');
      try {
        extractSkills(zip, topFolder, names);
      } catch (err) {
        if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
        throw err;
      }
      writeMeta({
        downloadedAt: new Date().toISOString(),
        ref: 'main',
        skills: names,
      });
      const count = existsSync(skillsDir)
        ? readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length
        : 0;
      return { ok: true, count };
    } catch (err) {
      return {
        ok: false,
        count: 0,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle('skillsRemote:skip', async (): Promise<void> => {
    writeMeta({
      downloadedAt: new Date().toISOString(),
      ref: 'main',
      skills: [],
      skipped: true,
    });
  });

  ipcMain.handle('skillsRemote:status', async (): Promise<SkillsCacheStatus> => {
    const meta = readMeta();
    if (!meta) {
      return { installed: false, downloadedAt: null, count: 0, skills: [], skipped: false };
    }
    const skillsDir = join(boilerplateCacheDir(), '.claude', 'skills');
    const count = existsSync(skillsDir)
      ? readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length
      : 0;
    return {
      installed: !meta.skipped,
      downloadedAt: meta.downloadedAt ?? null,
      count,
      skills: meta.skills,
      skipped: meta.skipped ?? false,
    };
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

---

### Task 4: Update `pathService.ts` and register in `index.ts`

**Files:**
- Modify: `src/main/services/pathService.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `userDataPath()` already exists in `pathService.ts`
- Produces: `boilerplateRepoRoot()` now checks `userData/boilerplate/` first

- [ ] **Step 1: Update `boilerplateRepoRoot()` in `pathService.ts`**

Replace the `boilerplateRepoRoot` function body to add `userData/boilerplate/` as first priority:

```typescript
export function boilerplateRepoRoot(): string {
  // Priority 1: user's downloaded cache (from skillsRemoteService)
  const userDataCache = join(app.getPath('userData'), 'boilerplate');
  if (existsSync(join(userDataCache, '.claude', 'skills'))) {
    return userDataCache;
  }

  // Priority 2: dev mode — walk up directory tree
  const here = dirname(fileURLToPath(import.meta.url));
  let cursor = here;
  for (let hop = 0; hop < 10; hop++) {
    if (existsSync(join(cursor, '.claude', 'skills', 'feature-loop'))) {
      return cursor;
    }
    const parent = resolve(cursor, '..');
    if (parent === cursor) break;
    cursor = parent;
  }

  // Priority 3: bundled fallback (extraResources)
  const resourceFallback = join(process.resourcesPath ?? '', 'boilerplate');
  if (existsSync(join(resourceFallback, '.claude', 'skills'))) {
    return resourceFallback;
  }

  throw new Error(
    `Could not locate boilerplate repo root. Download skills via the onboarding screen or Settings.`,
  );
}
```

- [ ] **Step 2: Register `skillsRemoteService` in `index.ts`**

In `src/main/index.ts`, add import at the top with existing imports:

```typescript
import { registerSkillsRemoteIpc } from './services/skillsRemoteService.js';
```

Then in `app.whenReady().then(...)`, add:

```typescript
registerSkillsRemoteIpc();
```

alongside the existing `registerSkillsIpc();` call.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

---

### Task 5: Update `preload.ts`

**Files:**
- Modify: `src/main/preload.ts`

**Interfaces:**
- Consumes: `SkillsRemoteListResult`, `SkillsInstallResult`, `SkillsCacheStatus` from `@shared/ipc`
- Produces: `window.orchestrator.skillsRemote.*` available in renderer

- [ ] **Step 1: Add imports**

In `src/main/preload.ts`, add to the existing import from `@shared/ipc`:

```typescript
  SkillsCacheStatus,
  SkillsInstallResult,
  SkillsRemoteListResult,
```

- [ ] **Step 2: Add `skillsRemote` to the `api` object**

In the `api` object in `preload.ts`, add after the `skills` property:

```typescript
  skillsRemote: {
    fetchList: () =>
      ipcRenderer.invoke('skillsRemote:fetchList') as Promise<SkillsRemoteListResult>,
    install: (names: string[]) =>
      ipcRenderer.invoke('skillsRemote:install', names) as Promise<SkillsInstallResult>,
    installAll: () =>
      ipcRenderer.invoke('skillsRemote:installAll') as Promise<SkillsInstallResult>,
    status: () =>
      ipcRenderer.invoke('skillsRemote:status') as Promise<SkillsCacheStatus>,
    skip: () => ipcRenderer.invoke('skillsRemote:skip') as Promise<void>,
  },
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

---

### Task 6: Create `Onboarding.tsx`

**Files:**
- Create: `src/renderer/components/onboarding/Onboarding.tsx`

**Interfaces:**
- Consumes: `api().skillsRemote.fetchList()`, `api().skillsRemote.install()`, `api().skillsRemote.installAll()`
- Produces: `<Onboarding onDone={() => void} />` — calls `onDone` when install completes or user skips

- [ ] **Step 1: Create the component**

Create `src/renderer/components/onboarding/Onboarding.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { api } from '@renderer/lib/api';
import type { SkillInfo } from '@shared/ipc';

type Phase = 'loading' | 'ready' | 'installing' | 'done' | 'error';

export function Onboarding({ onDone }: { onDone: () => void }): JSX.Element {
  const [phase, setPhase] = useState<Phase>('loading');
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [installedCount, setInstalledCount] = useState(0);

  useEffect(() => {
    void api()
      .skillsRemote.fetchList()
      .then((res) => {
        if (!res.ok) {
          setError(res.reason ?? 'Failed to fetch skill list.');
          setPhase('error');
          return;
        }
        setSkills(res.skills);
        setSelected(new Set(res.skills.map((s) => s.name)));
        setPhase('ready');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Network error.');
        setPhase('error');
      });
  }, []);

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(skills.map((s) => s.name)));
  const deselectAll = () => setSelected(new Set());

  const install = async () => {
    setPhase('installing');
    setError(null);
    try {
      const names = [...selected];
      const res = await api().skillsRemote.install(names);
      if (!res.ok) {
        setError(res.reason ?? 'Install failed.');
        setPhase('error');
        return;
      }
      setInstalledCount(res.count);
      setPhase('done');
      setTimeout(() => onDone(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed.');
      setPhase('error');
    }
  };

  const skip = async () => {
    await api().skillsRemote.skip().catch(() => {});
    onDone();
  };

  const retry = () => {
    setPhase('loading');
    setError(null);
    void api()
      .skillsRemote.fetchList()
      .then((res) => {
        if (!res.ok) {
          setError(res.reason ?? 'Failed to fetch skill list.');
          setPhase('error');
          return;
        }
        setSkills(res.skills);
        setSelected(new Set(res.skills.map((s) => s.name)));
        setPhase('ready');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Network error.');
        setPhase('error');
      });
  };

  return (
    <div className="flex flex-col h-screen bg-[#0b0d10] text-neutral-100 items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Welcome to codeGem</h1>
          <p className="text-sm text-neutral-400 mt-1">Install Claude Code skills to begin</p>
        </div>

        {phase === 'loading' && (
          <div className="flex items-center gap-3 text-sm text-neutral-400">
            <Spinner />
            Fetching skill list…
          </div>
        )}

        {(phase === 'ready' || phase === 'installing') && (
          <>
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>{skills.length} skills available</span>
              <div className="flex gap-3">
                <button className="hover:text-neutral-300 transition-colors" onClick={selectAll}>
                  Select all
                </button>
                <button className="hover:text-neutral-300 transition-colors" onClick={deselectAll}>
                  Deselect all
                </button>
              </div>
            </div>

            <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
              {skills.map((skill) => (
                <label
                  key={skill.name}
                  className="flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-surface-800 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-violet-500"
                    checked={selected.has(skill.name)}
                    onChange={() => toggle(skill.name)}
                    disabled={phase === 'installing'}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{skill.name}</div>
                    <div className="text-xs text-neutral-400 truncate">{skill.description}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                className="btn-primary flex items-center gap-2"
                onClick={install}
                disabled={phase === 'installing' || selected.size === 0}
              >
                {phase === 'installing' && <Spinner small />}
                {phase === 'installing'
                  ? `Installing…`
                  : `Install ${selected.size} skill${selected.size !== 1 ? 's' : ''}`}
              </button>
              <button
                className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
                onClick={skip}
                disabled={phase === 'installing'}
              >
                Skip for now →
              </button>
            </div>
          </>
        )}

        {phase === 'done' && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <span>✓</span>
            {installedCount} skills installed — entering app…
          </div>
        )}

        {phase === 'error' && (
          <div className="space-y-3">
            <div className="text-sm text-red-400">{error}</div>
            <div className="flex gap-3">
              <button className="btn-ghost" onClick={retry}>
                Retry
              </button>
              <button
                className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
                onClick={skip}
              >
                Skip for now →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner({ small }: { small?: boolean }): JSX.Element {
  const size = small ? 'w-3 h-3' : 'w-4 h-4';
  return (
    <svg className={`${size} animate-spin text-violet-400`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

---

### Task 7: Create `SkillsUpdater.tsx` and update `LaunchPanel.tsx`

**Files:**
- Create: `src/renderer/components/config-rail/SkillsUpdater.tsx`
- Modify: `src/renderer/components/launch-panel/LaunchPanel.tsx`

**Interfaces:**
- Consumes: `api().skillsRemote.status()`, `api().skillsRemote.installAll()`
- Produces: `<SkillsUpdater />` component rendered inside `LaunchPanel`

- [ ] **Step 1: Create `SkillsUpdater.tsx`**

Create `src/renderer/components/config-rail/SkillsUpdater.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@renderer/lib/api';
import type { SkillsCacheStatus } from '@shared/ipc';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

export function SkillsUpdater(): JSX.Element {
  const [status, setStatus] = useState<SkillsCacheStatus | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    void api()
      .skillsRemote.status()
      .then(setStatus)
      .catch(() => {});
  }, []);

  const update = async () => {
    setUpdating(true);
    try {
      const res = await api().skillsRemote.installAll();
      if (!res.ok) {
        toast.error(res.reason ?? 'Update failed.');
        return;
      }
      toast.success(`${res.count} skills updated`);
      const fresh = await api().skillsRemote.status();
      setStatus(fresh);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="border-t border-surface-700 pt-3 mt-3 space-y-2">
      <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Skills</div>
      <div className="text-[11px] text-neutral-500">
        Source: github.com/Muhammad-uzair029/claude-code-boilerplate
      </div>
      {status ? (
        <div className="text-[11px] text-neutral-400">
          {status.installed
            ? `${status.count} skills · Updated ${status.downloadedAt ? timeAgo(status.downloadedAt) : 'unknown'}`
            : status.skipped
              ? 'Not installed (skipped)'
              : 'Not installed'}
        </div>
      ) : (
        <div className="text-[11px] text-neutral-500">Checking…</div>
      )}
      <button
        className="btn-ghost text-xs flex items-center gap-1.5"
        onClick={update}
        disabled={updating}
      >
        {updating && (
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {updating ? 'Updating…' : 'Update All'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add `<SkillsUpdater />` to `LaunchPanel.tsx`**

In `src/renderer/components/launch-panel/LaunchPanel.tsx`:

Add import at the top:
```typescript
import { SkillsUpdater } from '@renderer/components/config-rail/SkillsUpdater';
```

In the returned JSX, add `<SkillsUpdater />` after the closing `</div>` of the Stage section (just before the closing `</section>`):

```tsx
      <SkillsUpdater />
    </section>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

---

### Task 8: Update `AppShell.tsx` — Onboarding gate

**Files:**
- Modify: `src/renderer/components/layout/AppShell.tsx`

**Interfaces:**
- Consumes: `api().skillsRemote.status()`, `<Onboarding onDone={...} />`
- Produces: `<AppShell />` renders onboarding on first launch, main UI otherwise

- [ ] **Step 1: Add onboarding gate to `AppShell.tsx`**

Add imports at top of `AppShell.tsx`:
```typescript
import { Onboarding } from '@renderer/components/onboarding/Onboarding';
```

Add state in the `AppShell` function body (after existing state declarations):
```typescript
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null); // null = checking
```

Add a `useEffect` to check status on mount (add alongside the existing config-read useEffect):
```typescript
  useEffect(() => {
    void api()
      .skillsRemote.status()
      .then((s) => {
        setOnboardingDone(s.installed || s.skipped);
      })
      .catch(() => {
        setOnboardingDone(true); // on error, show main UI
      });
  }, []);
```

At the top of the return statement, add the gate before the main `<div>`:
```tsx
  if (onboardingDone === null) {
    return (
      <div className="flex h-screen bg-[#0b0d10] items-center justify-center">
        <svg className="w-5 h-5 animate-spin text-violet-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!onboardingDone) {
    return <Onboarding onDone={() => setOnboardingDone(true)} />;
  }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Build and run dev**

```bash
pnpm dev
```

Verify:
- If `userData/boilerplate/meta.json` does not exist → onboarding screen appears
- Skill list loads from GitHub
- Select/deselect works
- "Install N skills" downloads and shows success → auto-transitions to main app
- "Skip for now" goes straight to main app
- Re-open app → main app shown directly (meta.json exists)
- Advanced collapsible → SkillsUpdater shows source URL, skill count, "Update All" button
- "Update All" re-downloads and updates the timestamp

- [ ] **Step 4: Commit all changes**

```bash
git add src/shared/ipc.ts \
        src/main/services/skillsRemoteService.ts \
        src/main/services/pathService.ts \
        src/main/index.ts \
        src/main/preload.ts \
        src/renderer/components/onboarding/Onboarding.tsx \
        src/renderer/components/config-rail/SkillsUpdater.tsx \
        src/renderer/components/launch-panel/LaunchPanel.tsx \
        src/renderer/components/layout/AppShell.tsx \
        package.json pnpm-lock.yaml
git commit -m "feat(skills-updater): GitHub ZIP onboarding + Settings update button"
```
