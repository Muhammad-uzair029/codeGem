# codeGem

AI-powered feature orchestrator for Claude Code workflows.

Built on Electron + React + node-pty.

codeGem is a desktop app that turns a feature idea into shipped code using Claude Code. You pick a project, write a short feature brief, and codeGem runs the **feature-loop**: it brainstorms, writes a spec, builds, verifies (with self-healing retries), and records what it learned. You watch it live in the app.

> Click any section below to expand it.

**Contents:** [What is codeGem](#what-is-codegem) · [Quick start](#quick-start) · [Use the skills in another project](#use-the-skills-in-another-project) · [The feature-loop](#the-feature-loop) · [All skills](#all-skills) · [Repo layout](#repo-layout) · [Development](#development)

---

<a id="what-is-codegem"></a>
<details open>
<summary><h2>🧭 What is codeGem</h2></summary>

Three pieces work together:

| Piece | Role |
|---|---|
| **Skills** (in `.claude/skills/`, from [claude-code-boilerplate](https://github.com/Muhammad-uzair029/claude-code-boilerplate)) | The instructions Claude follows to build a feature |
| **codeGem** (this app) | Installs those skills into your project, collects the brief, runs the loop, and shows progress |
| **Claude Code CLI** (`claude`) | Does the actual coding work |

### What the app does

1. **Project selector.** Pick a folder and tag it as a new or existing project, with an optional framework (`REACT_NATIVE_EXPO` or `NEST_JS`). Recent projects are remembered.
2. **Skill injection.** Copies all skills, or the ones you choose, into `<project>/.claude/skills/`, plus a `CLAUDE.md` and the `.claude/specs/{inbox,active}/` folders.
3. **Brief intake.** A form that saves your feature description to `.claude/specs/inbox/`. Paste a Figma URL and it extracts the file key and node ID, and can write `.mcp.json` so Claude can read the design.
4. **Launch.** Stays disabled until a brief exists, then runs `claude` with `/feature-loop`. The dashboard tracks the current stage live.
5. **Workspace.** A built-in Claude Code terminal, a code explorer, and a config rail with settings and todos.

**Do I need the app?** No. You can copy the skills into any project and run `/feature-loop` yourself in `claude`. The app adds a guided screen-by-screen flow, stage tracking, Figma handoff, and switching between several client projects.

</details>

<a id="quick-start"></a>
<details>
<summary><h2>🚀 Quick start</h2></summary>

**Option A: install a release.** Download the build for your OS from [GitHub Releases](https://github.com/Muhammad-uzair029/codeGem/releases) (`.dmg` / `.zip` for macOS, `.exe` for Windows, `.AppImage` / `.deb` for Linux). The app updates itself.

> macOS builds are unsigned. If macOS blocks the app, run `xattr -cr /Applications/Feature-Loop-Manager.app`.

**Option B: run from source.**

```bash
pnpm install
pnpm dev
```

**Prerequisite:** the Claude Code CLI must be on your `PATH` (`claude`). If it isn't, codeGem falls back to `npx`.

**First run:**
1. The onboarding screen downloads the latest skills from GitHub. Choose **Skip for now** to use the bundled copy.
2. Pick your project folder.
3. Inject skills.
4. Write a feature brief and press **Launch**.

</details>

<a id="use-the-skills-in-another-project"></a>
<details>
<summary><h2>📦 Use the skills in another project</h2></summary>

### Through the app (recommended)

Pick the project in codeGem, then inject skills. This creates:

```
<your-project>/
├── CLAUDE.md                 ← from templates/CLAUDE.md
└── .claude/
    ├── skills/               ← the skill matrix
    └── specs/
        ├── inbox/            ← drop feature briefs here
        └── active/           ← decomposed spec sets
```

### By hand (no app)

```bash
mkdir -p /path/to/project/.claude/skills
cp -R .claude/skills/* /path/to/project/.claude/skills/
cp templates/CLAUDE.md /path/to/project/CLAUDE.md   # optional
```

To take only some skills, copy just those folders (for example `feature-loop` and `pre-merge-check`). Note that `feature-loop` calls many of the other skills during verification, so copy the full set if you use it.

Then open the project in `claude` and use them as slash commands, for example `/feature-loop -y auth/login`.

> **Note:** `templates/CLAUDE.md` is written for React Native/Expo + NestJS projects (Orval-generated hooks, 42-rule security audit). For other stacks, edit it or leave it out.

</details>

<a id="the-feature-loop"></a>
<details>
<summary><h2>🔁 The feature-loop</h2></summary>

`feature-loop` is the main entry point. Give it a rough brief and it produces a spec, writes the code, verifies it against the spec, and updates the skills from what it learned.

### Stages

```
 brief (.claude/specs/inbox/)
   │
   ▼
[-1] PRD splitter ──── only if the doc has several features   ⏸ split-approve
   │
   ▼
[ 0] Brainstormer ──── refined brief, user journeys, edge cases, open questions   ⏸ approve
   │
   ▼
[ 1] Spec writer ───── index, frontend, backend, AI engine, contracts, security, tests, rollout…
   │
   ▼
[ 2] Implementer ◄──────────────┐
   │                            │ gaps / stack trace
   ▼                            │
[ 3] Verifier ──── block ───────┘   (up to 3 build iterations + 3 self-heal retries)
   │  ship
   ▼
[ 4] Result writer ─── results/result.md
   │
   ▼
[ 5] Learnings ─────── patches skills / templates with what it learned
```

| Stage | What happens | Output |
|---|---|---|
| **-1 · PRD splitter** | Splits a multi-feature document into separate features in dependency order | `.claude/specs/inbox/_split-<date>.md` |
| **0 · Brainstormer** | Refines the brief against existing specs, maps user journeys and edge cases, lists open questions | `brief-refined.md`, `user-journeys.md`, `edge-cases.md`, `open-questions.md` |
| **1 · Spec writer** | Writes one spec file per concern | `index.md`, `frontend-ui.md`, `backend-api.md`, `contracts.md`, `security.md`, `tests.md`, `rollout.md`, … |
| **2 · Implementer** | Writes the code. For NestJS controllers/DTOs it regenerates `swagger.json` and runs Orval for typed client hooks | Code diff + `build/iter-N-*.md` |
| **3 · Verifier** | **Compile gate** first (`pre-merge-check`, `contract-drift-check`, `null-safety-scan`). On failure it sends the raw error back to the implementer to self-heal. Then it runs the review skills in parallel | `verify/iter-N-verdict.md` |
| **4 · Result writer** | Summarizes what shipped | `results/result.md` |
| **5 · Learnings** | Makes small additive patches to skills/templates (max 1 per skill per feature, ≤ 40 lines) | `learnings/<date>-learnings.md` |

All files for a feature go under `.claude/specs/<module>/<feature>/`.

If the build still fails after the retry limits, the loop stops and tags the result `ESCALATE` or `SELF-HEAL-EXHAUSTED` for a human to pick up.

### Human gates

By default the loop pauses twice: after splitting a multi-feature PRD (`split-approve`) and after brainstorming (`approve`). With `-y` it runs unattended and fills non-blocking open questions with safe defaults. Each auto-resolved question is stamped so reviewers can check it. Questions tagged `BLOCKING` (missing product intent) still stop the loop.

### Commands

| Command | What it does |
|---|---|
| `/feature-loop <mod>/<feat>` | Start or resume |
| `/feature-loop -y <mod>/<feat>` | Run end to end unattended |
| `/feature-loop --from-doc <path> <mod>/<feat>` | Use a document from anywhere as the brief |
| `/feature-loop split-approve` | Accept the PRD split |
| `/feature-loop approve <mod>/<feat>` | Pass the brainstorm gate |
| `/feature-loop revise <mod>/<feat> "<feedback>"` | Send the brainstorm back with feedback |
| `/feature-loop --from-spec <mod>/<feat>` | Skip stages 0–1 and build from an existing spec |
| `/feature-loop --verify-only <mod>/<feat>` | Run only stage 3 on the current diff |
| `/feature-loop --dry-learnings <mod>/<feat>` | Preview stage-5 patches without applying them |
| `--max-iters N` / `--max-heal-iters N` | Change the retry limits (default 3 each) |

Full playbook: [`.claude/skills/feature-loop/SKILL.md`](.claude/skills/feature-loop/SKILL.md), with one file per stage in [`agents/`](.claude/skills/feature-loop/agents).

</details>

<a id="all-skills"></a>
<details>
<summary><h2>🧰 All skills</h2></summary>

26 skills, grouped by purpose. Each one is a folder in [`.claude/skills/`](.claude/skills) with a `SKILL.md`. Run any of them as `/<skill-name>` in Claude Code.

<details>
<summary><b>🏗️ Build</b>: create features and UI</summary>

| Skill | What it does |
|---|---|
| `feature-loop` | The 6-stage autonomous feature loop described above |
| `figma-to-code` | Turns a Figma URL or node into React Native + NativeWind components (entry point) |
| `figma-to-code-skill` | The full Figma → React Native playbook: flexbox layout, design tokens first, reusable components |
| `react-native-optimization-and-architecture` | React Native / Expo best practices: list performance, animations, native modules |

</details>

<details>
<summary><b>✅ Quality gates</b>: run before merge</summary>

| Skill | What it does |
|---|---|
| `quality-assurance` | Compile gate (pre-merge-check + contract-drift-check + null-safety-scan) with up to 3 self-healing retries |
| `pre-merge-check` | Runs lint, typecheck, and tests in parallel (TS/JS and Python); blocks on failure |
| `null-safety-scan` | Finds unguarded property access, missing optional chaining, unchecked returns |
| `complexity-check` | Enforces limits on function/file length, nesting, parameters, and cyclomatic complexity |
| `test-coverage-delta` | Reports only the **new** lines that aren't covered by tests |
| `dead-code-scan` | Finds unused exports, unreachable branches, orphan files |
| `perf-budget` | Tracks bundle size, API p95 latency, and RN startup against a baseline; blocks regressions |

</details>

<details>
<summary><b>🔗 Contracts and data</b>: keep services in sync</summary>

| Skill | What it does |
|---|---|
| `contract-drift-check` | Catches renamed, removed, or newly-required fields between frontend, backend, and AI engine |
| `api-mock-parity` | Checks that mock fixtures still match the real API schema |
| `migration-safety` | Flags risky DB migrations: drops, NOT NULL on full tables, locking indexes, unsafe backfills |
| `dependency-hygiene` | Finds unused packages, duplicate versions, peer conflicts, license drift |

</details>

<details>
<summary><b>🔒 Security</b></summary>

| Skill | What it does |
|---|---|
| `security-audit` | 42-rule OWASP Top 10 gate, single-rule deep dives, API over-sharing audit, full pen-test report |
| `security-scan` | Scans the staged diff for secrets and known-vulnerable dependencies |
| `pentesting` | Red-team attack-surface analysis with parallel recon agents; can apply fixes with your permission |

</details>

<details>
<summary><b>👀 Review and design</b>: for team leads</summary>

| Skill | What it does |
|---|---|
| `feature-review` | Merge verdict for someone else's PR: regression-risk map, approach critique, test gaps |
| `feature-audit` | Runs every relevant review skill on a feature in parallel and gives one merge verdict. Good as a nightly review |
| `system-design` | Audits React Native ↔ NestJS ↔ Python AI flows for race conditions, contracts, and production readiness |
| `adr-writer` | Writes an Architecture Decision Record to `docs/adr/` when you add a library or pattern |

</details>

<details>
<summary><b>🚢 Git and docs</b></summary>

| Skill | What it does |
|---|---|
| `git-push` | Reviews staged files, writes a Conventional Commit message, asks to confirm, then commits and pushes |
| `pr-open` | Opens a GitHub PR with title, summary, and test plan filled in from the diff |
| `generate-docs` | Writes feature documentation from recent changes into `docs/features/` |
| `team-pulse` | Daily or weekly digest of commits, PRs, and reviews across repos. Needs `.claude/team.yaml` |

</details>

### Updating the skills

The skills here are a copy of [claude-code-boilerplate](https://github.com/Muhammad-uzair029/claude-code-boilerplate). The app loads skills in this order:

1. The downloaded copy in the app's data folder (refresh it from **Settings → Update All**)
2. `.claude/skills/` in this repo (dev mode)
3. The copy bundled inside the packaged app (built from `.claude/skills/`)

To refresh the copy in this repo, copy `.claude/skills/` from the boilerplate repo again.

</details>

<a id="repo-layout"></a>
<details>
<summary><h2>🗂️ Repo layout</h2></summary>

```
codeGem/
├── .claude/skills/        ← bundled skill matrix (shipped inside the app)
├── src/
│   ├── main/services/     ← Electron main process: loop, terminal, skills, inbox, workspace, updater
│   ├── renderer/          ← React UI: onboarding, project selector, brief intake, launch panel,
│   │                        dashboard, terminal, code explorer, config rail
│   └── shared/            ← IPC types + project schema
├── templates/CLAUDE.md    ← CLAUDE.md written into target projects
├── scripts/               ← helper scripts (framework detection, node-pty postinstall)
├── e2e/                   ← Playwright tests
├── docs/                  ← plans and design specs
└── resources/             ← app icons for electron-builder
```

</details>

<a id="development"></a>
<details>
<summary><h2>🛠️ Development</h2></summary>

| Command | What it does |
|---|---|
| `pnpm dev` | Run the app with hot reload |
| `pnpm build` | Build to `out/` |
| `pnpm typecheck` | Type-check the main and renderer code |
| `pnpm test:e2e` | Build, then run the Playwright dev suite |
| `pnpm test:e2e:all` | Run the dev and full suites |
| `pnpm pack:mac` / `pack:win` / `pack:linux` | Build installers into `dist/` |

**Releases:** pushing to `main` bumps the version and publishes installers to GitHub Releases through `.github/workflows/release.yml`.

</details>
