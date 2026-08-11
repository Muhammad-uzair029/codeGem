# Skills Updater — Design Spec

**Date:** 2026-08-11
**Status:** Approved

## Summary

On first launch, show an onboarding screen that lists all skills from the public boilerplate repo (`github.com/Muhammad-uzair029/claude-code-boilerplate`) and lets the user install them. After install, skills are cached in `userData/boilerplate/`. A Settings updater inside the Advanced panel lets users refresh the cache at any time. No authentication required — repo is public.

---

## Source

**Repo:** `https://github.com/Muhammad-uzair029/claude-code-boilerplate`
**ZIP endpoint:** `https://codeload.github.com/Muhammad-uzair029/claude-code-boilerplate/zip/refs/heads/main`
**No API key or token required.**

---

## Data Flow

### Download & Extract

1. `GET https://codeload.github.com/Muhammad-uzair029/claude-code-boilerplate/zip/refs/heads/main`
2. Save to `userData/boilerplate-download.zip` (temp)
3. Unzip — locate top-level folder (e.g. `claude-code-boilerplate-main/`)
4. Copy `<top>/.claude/skills/<name>/` → `userData/boilerplate/.claude/skills/<name>/` for each selected skill
5. Copy `<top>/.claude/CLAUDE.md` → `userData/boilerplate/.claude/CLAUDE.md`
6. Write `userData/boilerplate/meta.json`:
   ```json
   { "downloadedAt": "<ISO-string>", "ref": "main", "skills": ["feature-loop", "figma-to-code", ...] }
   ```
7. Delete temp ZIP file

### Skill List (for onboarding UI)

After downloading the ZIP, read each folder under `.claude/skills/`. For each:
- Name = folder name
- Description = first non-empty line of `SKILL.md` (after any YAML frontmatter `---` block), or folder name if no SKILL.md

### pathService.ts Priority Order

1. `userData/boilerplate/` ← **new, highest priority** (downloaded cache)
2. `process.resourcesPath/boilerplate/` (bundled fallback — can be empty)
3. Walk-up directory tree (dev mode only)

---

## IPC Contract

**New types in `src/shared/ipc.ts`:**

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
  installed: boolean;       // true if meta.json exists
  downloadedAt: string | null;
  count: number;
  skills: string[];
}
```

**New namespace on `OrchestratorApi`:**

```typescript
skillsRemote: {
  fetchList: () => Promise<SkillsRemoteListResult>;      // download ZIP, read skill names+descriptions
  install: (names: string[]) => Promise<SkillsInstallResult>; // extract selected skills to userData
  installAll: () => Promise<SkillsInstallResult>;        // extract all skills to userData
  status: () => Promise<SkillsCacheStatus>;              // read meta.json
}
```

`fetchList` downloads the ZIP each time it is called (no separate cache step — the full install writes to disk).

---

## UI — Onboarding Screen

**Trigger:** App startup checks `userData/boilerplate/meta.json`. If missing → show `<Onboarding />` instead of `<AppShell />`.

**Layout:**

```
┌─────────────────────────────────────────┐
│  Welcome to codeGem                     │
│  Install Claude Code skills to begin    │
│                                         │
│  [●●●●●●○○○○] Fetching skill list...   │  ← loading state
│                                         │
│  ☑ feature-loop      AI feature engine  │
│  ☑ figma-to-code     Figma → React      │
│  ☑ quality-assurance Self-healing CI    │
│  ☑ git-push          Smart commits      │
│  ☑ security-audit    OWASP scanner      │
│  ... (all 26 pre-checked)               │
│                                         │
│  [Install Selected]   Skip for now →   │
└─────────────────────────────────────────┘
```

States:
- **Loading:** spinner while ZIP is fetched and skill list is parsed
- **Ready:** checklist shown, all skills pre-checked
- **Installing:** progress bar + "Installing X of Y skills…"
- **Done:** brief success message → auto-transition to `<AppShell />` after 1.5s
- **Error:** inline error with retry button

"Skip for now" skips onboarding and enters the app. Skill injection will use fallback stubs until the user installs via Settings.

---

## UI — Settings Updater (inside Advanced panel)

New `<SkillsUpdater />` component rendered at the bottom of `<LaunchPanel />` (inside the existing `Advanced` collapsible):

```
──────────────────────────────
Skills
  Source: github.com/Muhammad-uzair029/claude-code-boilerplate
  Installed: 26 skills · Updated 3 days ago
  [Update All]
──────────────────────────────
```

- **Update All** button: re-runs `installAll()`, shows spinner, updates the "Updated X ago" timestamp on success
- Disabled + spinner while update is in progress
- Error toast (Sonner) on failure

---

## Files Changed

| File | Change |
|---|---|
| `src/main/services/skillsRemoteService.ts` | **New** — ZIP download, extract, `fetchList` / `install` / `installAll` / `status` IPC handlers |
| `src/main/services/pathService.ts` | Add `userData/boilerplate/` as first-priority path in `boilerplateRepoRoot()` |
| `src/main/index.ts` | Register `skillsRemoteService` IPC |
| `src/shared/ipc.ts` | Add `SkillInfo`, `SkillsRemoteListResult`, `SkillsInstallResult`, `SkillsCacheStatus`, `skillsRemote` namespace |
| `src/main/preload.ts` | Expose `skillsRemote.*` via contextBridge |
| `src/renderer/components/onboarding/Onboarding.tsx` | **New** — first-launch screen |
| `src/renderer/components/config-rail/SkillsUpdater.tsx` | **New** — update panel in Advanced section |
| `src/renderer/components/launch-panel/LaunchPanel.tsx` | Add `<SkillsUpdater />` at bottom |
| `src/renderer/components/layout/AppShell.tsx` | Check `skillsRemote.status()` on mount; render `<Onboarding />` or main UI |

---

## Error Handling

- Network failure during ZIP download: show error message + retry button in onboarding; toast in Settings
- ZIP parse failure: treat as network error
- Partial extract failure: roll back (delete partial `userData/boilerplate/`) and report error
- `fetchList` called without internet: surface "No connection — check your internet and try again"

---

## Out of Scope

- Individual skill version tracking (all skills come from `main` branch HEAD)
- Offline skill browsing without prior install
- Removing/uninstalling individual skills after install
