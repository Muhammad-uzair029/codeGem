---
title: Skills site — browse, learn, and install codeGem skills with one command
status: approved
drafted: 2026-10-28
---

# Skills site

## Intent and the why

codeGem ships 26 Claude Code skills (in `.claude/skills/`, mirrored from the
public `claude-code-boilerplate` repo). Today the only way in is the repo:
people have to find it, read raw `SKILL.md` files to work out what each skill
does, and copy folders by hand. As a result the internal Softaims team uses
few of them.

The goal is a **static website** that becomes the team's front door to the
skills instead of the repository. A newcomer should be able to land on it,
understand what the skills are (feature-loop first), find the one they need,
read clear instructions, and install it into their own project on their own
laptop with **one copy-pasted command**.

Success: a teammate who has never seen the repo goes from landing page to a
working `/feature-loop` (or any other skill) in their project in a few minutes,
without opening GitHub.

## Goals

1. **Landing page** explaining what the skills are and how they fit together,
   with the feature-loop as the headline.
2. **Search and browse** all skills: search by name and description, filter by
   group (Build, Quality gates, Contracts and data, Security, Review and design,
   Git and docs — same grouping as `README.md`).
3. **One page per skill** with: what it does, when to use it, its slash
   commands and flags, which other skills it uses or is used by, and its
   install command with a copy button. The feature-loop page includes an
   interactive stage diagram (-1 → 5) where clicking a stage shows what it
   does and what files it writes.
4. **One-command install**, for a single skill, a chosen set, or all skills,
   run from the user's project folder.
5. **Easy to deploy on Vercel or Netlify**: plain static output, no servers,
   no environment variables, config files for both hosts committed.
6. **Stays in sync automatically**: pages and installable files are generated
   at build time from `.claude/skills/`. Adding or editing a skill and
   redeploying updates the site with no hand-written pages.

## Non-goals

- No accounts, login, analytics dashboards, ratings, or comments.
- No editing skills through the site.
- No npm package publishing (the command must work without it).
- Not a replacement for the codeGem desktop app; the site may link to it.

## Anti-goals (would be a failure even if it technically works)

- The install command silently overwrites a teammate's locally edited skill.
- The site shows a skill version that differs from what the command installs.
- Deploying needs secrets, a backend, or manual steps beyond "connect repo,
  set root folder".
- Pages that are just raw markdown dumps a newcomer can't follow.

## Constraints

- **codeGem's GitHub repo is private.** The installer must not download from
  it. The boilerplate repo is public but may drift from codeGem's copy.
- Team uses macOS, Linux, and Windows (codeGem ships for all three).
- Skill content is the 150 files under `.claude/skills/` (868K). Some skills
  have extra folders (`feature-loop/{agents,commands,scripts,templates}`,
  `pentesting/scripts`); these must be installed too, with executable bits
  preserved on `scripts/*.sh`.
- Each `SKILL.md` has YAML frontmatter with `name` and `description`; the rest
  is free-form markdown with no consistent section names.

## Decisions (my calls — override any of them)

These were not explicitly chosen by the user; they are defaults I picked.

1. **Location:** a new `site/` folder in the codeGem repo. Vercel / Netlify
   "root directory" = `site`. The build reads `../.claude/skills/`.
2. **Generator:** Astro, static output. It handles markdown well and outputs
   plain HTML/CSS/JS that both hosts serve with zero config.
3. **The site serves the skill files itself.** At build time every skill
   folder is copied into the static output (e.g. `/skills/<name>/...`) plus a
   generated `manifest.json` listing each skill, its files, and dependencies.
   The installer downloads only from the site. This solves the private-repo
   problem and guarantees the site and the installer show the same version.
4. **Install command shape:**
   - macOS / Linux: `curl -fsSL https://<site>/install.sh | bash -s -- feature-loop pre-merge-check`
     and `... | bash -s -- --all`
   - Windows (PowerShell): `iwr https://<site>/install.ps1 -useb | iex; Install-Skills feature-loop`
     (exact shape left to the builder; it must be one line to paste).
   - The base URL is baked into the scripts at build time from the deploy
     URL, with a fallback the user can set in one place.
5. **Install target:** the current folder's `./.claude/skills/<name>/`. A
   `--global` flag installs to `~/.claude/skills/` instead.
6. **Dependencies:** installing `feature-loop`, `feature-audit`,
   `quality-assurance`, `feature-review`, or `figma-to-code` also installs the
   skills they call. **Source of truth is `site/skills-meta.json`**
   (hand-maintained, seeded from each `SKILL.md`'s composition list). The
   build fails if a listed dependency doesn't exist as a skill folder.
   Dependencies are followed **down the whole chain** (e.g. `feature-audit` →
   `feature-review` → `pre-merge-check`), with cycles handled. The resolved
   list goes into `manifest.json`; the skill page shows "Also installs" and
   "Used by" from it. `--no-deps` skips dependencies.
7. **Existing skills:** if a skill folder already exists, the installer skips
   it and says so. `--force` overwrites **only the skills the user named**,
   never dependencies pulled in automatically (those are still skipped if
   present). Overwrite means: move the existing folder to
   `.claude/skills/.backup/<name>-<timestamp>/`, then copy the new version
   fresh, so dropped files don't linger and local edits are recoverable. The
   installer prints where the backup went. Never overwrite silently.
8. **Grouping data:** a small hand-maintained `site/skills-meta.json` holds
   each skill's group, a one-line plain-English summary, and its
   dependencies. If a skill isn't listed there it still appears (group
   "Other", summary from its frontmatter `description`), so new skills never
   vanish.
9. **Visibility:** public, open to anyone with the link (confirmed by the
   user 2026-10-28). No host-level password protection.
10. **Picker:** the browse page lets you tick several skills and builds the
    single command for that set, live.

## What each page shows

- **Home:** one-paragraph pitch, a "Get everything" block with the `--all`
  command for each OS, a feature-loop explainer with the stage diagram, and
  the group tiles.
- **Browse / search:** search box, group filter chips, skill cards (name,
  one-liner, group), multi-select with a live-built install command.
- **Skill page:** summary, "When to use it", commands/flags (pulled from the
  `SKILL.md`), dependencies and "used by", install command per OS, and the
  full `SKILL.md` rendered below for reference.
- **Getting started:** prerequisites (Claude Code CLI installed), run the
  command in your project folder, open `claude`, type `/<skill>`. Plus how to
  update (re-run with `--force <name>`; old copy is backed up) and uninstall
  (delete the folder).

## Left to the builder

- Visual design, layout, and component structure (should look clean and
  modern, readable in light and dark mode, and work on phones).
- Search implementation (client-side over the manifest is enough).
- How commands and flags are extracted from each `SKILL.md`, as long as the
  result is readable.
- Exact installer script internals, as long as they meet decisions 3–7, work
  on stock macOS/Linux (`bash`, `curl`) and Windows PowerShell 5+, and print
  a clear summary of what was installed and where.
- Tests: at minimum, a build step that fails if any skill folder is missing
  from the manifest, and a smoke test that runs `install.sh` against the
  built output into a temp folder.

## Deliverables

- `site/` with the Astro project, `vercel.json`, and `netlify.toml`.
- `site/README.md`: how to run locally and deploy to Vercel or Netlify in a
  few steps.
- A short "Install skills" section in the top-level `README.md` pointing at
  the site.
