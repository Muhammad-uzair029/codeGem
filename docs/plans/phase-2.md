---
title: Phase 2 — v0.2.0 three-panel workspace redesign
status: pending
target_version: 0.2.0
target_tag: flm-v0.2.0
drafted: 2026-08-05
author: Muhammad-uzair029
---

# Phase 2 — v0.2.0

Three-panel workspace redesign with an interactive Claude Code terminal and a code explorer. Refined and locked plan; execute later.

## Guiding principles

- **Diagnose before redesign.** Root-cause the "nothing works" v0.1.3 issue first; if fatal, fix as a hotfix, then build on stable ground.
- **Test the packaged .app, not the dev build.** E2E currently tests `out/main/index.js` directly. Real users run the .dmg. Gap = the "nothing works" bug in v0.1.3. Closing it.
- **UX = zero surprises.** Every async op gets a toast or spinner. Every gate has a visible reason. Every button has a keyboard shortcut. No blank states.
- **One CI run per phase, not one at the end.** Each phase ends with typecheck + E2E green before the next starts.

---

## Phase 0 · Diagnose (30 min · commits: 0–1)

Root-cause the "nothing works on v0.1.3 arm64" complaint before touching anything else.

- Download the published v0.1.3 arm64 `.dmg` on the executor's M1, mount it, launch it, record what fails.
- Emit a diagnosis note with root cause + severity.
- **Branch**:
  - Trivial (e.g., missing `xattr` step, hardcoded pill misread) → note it, no code change until Phase 5.
  - Fatal (main-process crash, IPC dead) → hotfix as `flm-v0.1.4`, ship, then start v0.2.0 on top.
- **Exit gate**: root cause named + severity classified in writing.

---

## Phase 1 · Foundation (2h · commits: 2)

Prep everything the redesign depends on. Nothing user-visible yet.

**Commit 1 · Deps + config**

- Add: `node-pty@^1.0.0`, `react-resizable-panels@^2.1.7`, `sonner@^1.5.0`, `electron-window-state@^5.0.3`, `react-arborist@^3.4.0`.
- Wire `vite define` so `import.meta.env.VITE_APP_VERSION` reads from `package.json` at build time → fixes the hardcoded `v0.1.0` pill in one line.
- Verify `node-pty` builds under `electron-builder install-app-deps` postinstall. Rebuild on macOS locally to prove it before touching CI.

**Commit 2 · IPC contract**

- Extend `src/shared/ipc.ts` with new surfaces:
  - `terminal.*` — `open`, `write`, `resize`, `close`, `onData`, `onExit`
  - `explorer.*` — `readTree`, `openInVSCode`, `openInFinder`, `hasVSCodeCli`
  - `notifications.*` — implicit; renderer-only via sonner
- Add preload wiring for each new surface.

**Exit gate**: `pnpm typecheck` clean · `pnpm test:e2e` still 5/5 green · new deps compile on macOS.

---

## Phase 2 · Three-column layout (2h · commits: 1)

**Commit 3 · Layout shell**

New `src/renderer/components/layout/AppShell.tsx`:

- `<PanelGroup direction="horizontal">` with three `<Panel>`s + `<PanelResizeHandle>`s.
- Default widths: 28% / 44% / 28%. Min widths: 200 / 320 / 240 px.
- Persist widths in `config.json` under new key `layout: { panel_sizes: [n, n, n] }`.
- Column headers with title + minimize icon (collapse to a slim icon rail with tooltips).
- Empty state on center column when no project picked: "Pick a project on the left to begin."

Migrate existing components untouched — old `Dashboard.tsx` becomes a thin composer.

**Exit gate**: dev + packaged builds render 3 columns · drag-to-resize works · widths survive app restart.

---

## Phase 3 · Section 1 · Config compaction (1h · commits: 1)

**Commit 4 · Config rail**

Same components, denser layout, one new feature:

- **Recent projects** dropdown at the top (from `config.history[]`). Click → hydrates project + framework + validation. Rescans framework silently.
- Sticky "Launch" button at the bottom (primary CTA never scrolls out of view).
- Collapse/expand sections (Project · Brief · Advanced) — remembered per-user.

No new IPC. No behavior change beyond the recent-projects convenience.

**Exit gate**: config rail fits in 320 px without truncation · recent-projects picker restores state correctly.

---

## Phase 4 · Section 2 · Interactive Claude Code terminal (2h · commits: 2)

Replace the read-only stream viewer with a real PTY.

**Commit 5 · PTY service**

New `src/main/services/terminalService.ts`:

- `terminal:open` → spawn `node-pty` with `bash` (or `$SHELL` if set), `cwd = project path`.
- Stream chunks back over `terminal:data:<sessionId>` renderer channel.
- `terminal:write` from renderer → `pty.write(data)`.
- `terminal:resize` → `pty.resize(cols, rows)` on xterm resize.
- Reuse existing `loop:*` channels for the "Feature loop" mode — no functional change, kept for auto-run compatibility.

**Commit 6 · Terminal UI**

Rewrite `TerminalView.tsx`:

- Toolbar with a segmented `[ Shell | Feature Loop ]` toggle.
- **Shell mode** (default): interactive PTY at project cwd. Type any command. `claude` runs live. Cursor + colors + tab-complete + arrow-key history all work.
- **Feature Loop mode**: same behavior as today (streams `/feature-loop --force-autonomous`).
- Buttons: Clear · Copy selection · Restart session · Stop.
- xterm.js `onData` → main → PTY.

**Exit gate**: shell mode accepts input · `ls`, `claude --help`, arrow-key history all work · resize doesn't garble output · mode-switch doesn't leak processes.

---

## Phase 5 · Section 3 · Code Explorer (1h · commits: 1)

**Commit 7 · Explorer**

- **Scope locked**: F1 — file tree + button (10 min extra vs. F2, big glance-browsing win).

New `src/main/services/explorerService.ts`:

- `explorer:readTree` — recursive read of project, ignore `node_modules`, `.git`, `dist`, `out`, `.next`, `.claude/specs/*/build`, `.claude/specs/*/verify`. Cap depth 6, cap 5000 entries.
- `explorer:openInVSCode` — `spawn('code', [projectPath], { detached: true })`. Falls back to `spawn('open', [projectPath])` if `code` missing; emits toast with install-cli link.
- `explorer:openInFinder` — `spawn('open', [projectPath])`.
- `explorer:hasVSCodeCli` — quick `which code` probe used at mount to pre-color the button.

New `src/renderer/components/code-explorer/CodeExplorer.tsx`:

- Header: truncated project path + Open in VS Code (primary) + Show in Finder (ghost).
- `react-arborist` file tree.
- Click file → toast "50 lines · TypeScript" (no in-app editor for v0.2.0; Monaco is a v0.3.0 candidate).

**Exit gate**: tree loads a 1000-file repo in <500 ms · VS Code button works when `code` CLI present · fallback triggers clean toast when it isn't.

---

## Phase 6 · Polish (3h · commits: 2)

**Scope locked**: ship items 1, 2, 3, 5, 6, 8. Defer 4, 7, 9, 10 to v0.2.1.

**Commit 8 · Notifications + progress**

- Wire `sonner` provider at app root.
- Toasts for: brief written · skills injected (with count) · loop launched · loop exited · errors.
- Progress bar during skill injection (24+ skills → 100%).
- Empty-state hint card on center column when no project picked.

**Commit 9 · Window state + shortcuts**

- `electron-window-state` persists size + position + fullscreen.
- Shortcuts:
  - `Cmd+O` — Browse existing directory
  - `Cmd+B` — Collapse/expand config rail
  - `Cmd+K` — Quick-switch project (opens recent-projects dropdown focused)
  - `Cmd+Enter` — Launch loop (only when all gates pass)
  - `Cmd+R` — Reload renderer (dev convenience)
- Verify the dynamic version pill landed correctly in Phase 1 commit 1.

**Deferred to v0.2.1** (per speed preference): pre-flight checklist card · confirm dialog on Stop · loading skeletons · dedicated onboarding tour.

**Exit gate**: all shortcuts respond · toasts appear on every listed op · window opens where user left it.

---

## Phase 7 · Testing (1h · commits: 1)

**Commit 10 · Packaged-app E2E**

This is what would have caught the "nothing works" bug in v0.1.3.

- Extend `playwright.config.ts` with a second project `packaged` that launches the `.app` bundle directly:
  `dist/mac-arm64/Feature-Loop\ Manager.app/Contents/MacOS/Feature-Loop\ Manager`.
- New `e2e/packaged.spec.ts` — same 5 smoke tests as the dev suite, plus:
  - Three columns render + resize.
  - Terminal accepts input (spawn `echo hello`, verify output appears in xterm).
  - VS Code button spawns a mock `code` (fake binary on PATH via test env; assert it was called with the correct arg).
  - File tree loads.
- Add `test:e2e:packaged` script.

**Exit gate**: `pnpm test:e2e && pnpm test:e2e:packaged` both green locally.

---

## Phase 8 · Release (30 min · commits: 1)

**Commit 11 · Bump + tag**

- Bump `package.json` version → `0.2.0`. Regenerate lockfile.
- Local `pnpm pack:dir` build.
- Executor physically launches the packaged .app on M1, clicks every button, confirms every flow. Screenshot the result and drop it in chat.
- If green: tag `flm-v0.2.0`, push, monitor CI.
- If CI green: executor downloads the CI-built `.dmg`, installs it in `/Applications`, `xattr -cr`, launches. Confirm it matches the local build.

**Exit gate**: assets attached to release · install steps verified end-to-end.

---

## Locked decisions

| # | Question | Locked pick | Why |
|---|---|---|---|
| 1 | Phase 0 diagnosis path | **B** — download + reproduce locally | Same OS as reporter; no back-and-forth latency |
| 2 | Code Explorer scope | **F1** — file tree + button | 10 min extra, big glance-browsing win |
| 3 | Polish scope | **Ship 1, 2, 3, 5, 6, 8**; defer 4, 7, 9, 10 to v0.2.1 | Best ROI; kills hardcoded pill, adds core UX, keeps velocity |
| 4 | Terminal default mode | **Interactive Shell** | Sets expectation "this is a real terminal"; Feature Loop is one segment click away |
| 5 | VS Code CLI presence | Auto-detect via `which code`; toast install hint if missing | Zero prerequisite for the user |

---

## Dependency delta

Add:

- `node-pty@^1.0.0` (native — needs `electron-rebuild`)
- `react-resizable-panels@^2.1.7`
- `sonner@^1.5.0`
- `electron-window-state@^5.0.3`
- `react-arborist@^3.4.0`

Remove: none.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `node-pty` fails to build on one CI platform | M | H — blocks release | Rebuild locally on macOS first (Phase 1); if Windows breaks, fall back to `child_process` with `stdin: 'pipe'` for shell mode (loses cursor, keeps input) |
| Phase 0 diagnosis finds a deep architectural bug | L | H | Ship hotfix `v0.1.4` before v0.2.0 begins |
| Packaged-app E2E flaky on macOS SIP | M | M | Use `--no-sandbox` when running under Playwright; well-known Electron pattern |
| VS Code CLI not on user PATH | H | L | Auto-detect via `which code`; toast install link; fall back to `open <path>` (Finder) |
| Bundle size balloons past 100 MB with node-pty + arborist | L | L | Vite tree-shakes arborist; node-pty is small; measure with `--stats` |

---

## Timeline

| Phase | Time | Cumulative |
|---|---|---|
| 0 Diagnose | 0.5h | 0.5h |
| 1 Foundation | 2h | 2.5h |
| 2 Layout | 2h | 4.5h |
| 3 Config | 1h | 5.5h |
| 4 Terminal | 2h | 7.5h |
| 5 Explorer | 1h | 8.5h |
| 6 Polish | 3h | 11.5h |
| 7 Testing | 1h | 12.5h |
| 8 Release + verify | 0.5h | **13h** |

---

## Release notes (draft)

```
Feature-Loop Manager v0.2.0 — three-panel workspace redesign.

• New: three-column layout — Config · Interactive Claude Code Terminal · Code Explorer.
• New: real bidirectional terminal (node-pty). Type back at Claude, use arrows for history, tab-complete works.
• New: "Open in VS Code" button + file tree for glance browsing.
• New: recent projects dropdown; toast notifications; keyboard shortcuts (Cmd+O/B/K/Enter).
• New: window position + size persist across launches.
• Fixed: version pill reads live from build (no more hardcoded v0.1.0).
• Fixed: drag-drop file selection on Electron 32 (from v0.1.3, re-confirmed under new E2E).
• Testing: E2E now runs against the packaged .app, not just the dev build.

Download → https://github.com/Muhammad-uzair029/claude-code-boilerplate/releases/tag/v0.2.0
```

---

## Kickoff prerequisites

- [ ] Executor has repo write access (Muhammad-uzair029).
- [ ] Executor has M1 (arm64) macOS available for local packaged-app verification.
- [ ] `which code` reported in chat before Phase 5 begins (or accept the auto-detect fallback).
- [ ] `gh` CLI authenticated for downloading release artifacts in Phase 0.
- [ ] No in-flight work on `main` conflicting with the phased commits above.

## How to start execution

Reply **"execute phase 2"** to kick off Phase 0. The executor will:
1. Read this file top-to-bottom.
2. Run Phase 0 diagnosis and post a written root-cause note.
3. Pause for a `go / hotfix first / adjust plan` decision.
4. Proceed through Phase 1–8 sequentially, committing at every commit boundary noted above.
