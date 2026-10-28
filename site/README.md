# codeGem skills site

A static site (Astro) that lets anyone browse codeGem's Claude Code skills and
install them into a project with one command. Design:
[`docs/superpowers/specs/2026-10-28-skills-site-design.md`](../docs/superpowers/specs/2026-10-28-skills-site-design.md).

Everything is generated at build time from `../.claude/skills/`:

| Output | What it is |
|---|---|
| `/`, `/browse/`, `/skill/<name>/`, `/getting-started/` | The pages |
| `/skills/<name>/...` | Every skill file, byte for byte. The installers download from here |
| `/manifest.json` | Skills, files, groups, summaries, direct and resolved (transitive) dependencies |
| `/install-index.tsv` | Same data in a form stock `bash` can read (used by `install.sh`) |
| `/install.sh`, `/install.ps1` | The installers, with this site's URL baked in |

The installers never download from GitHub, so the codeGem repo can stay private
and the site always shows exactly what the installer installs.

## Run locally

```bash
cd site
npm install
npm run dev            # http://localhost:4321, installers work against the dev server too
npm run build          # writes dist/
npm run preview        # serves dist/
npm run test:install   # smoke-tests install.sh against dist/ (needs python3 and curl)
```

Node 22.12 or newer is needed (`.nvmrc` says 22; run `nvm use` in `site/`). Hosts use Node 22. Use npm; the lockfile is `package-lock.json`.

## Adding or changing skills

Add or edit a folder in `.claude/skills/` and redeploy. Pages, files, and the
manifest update by themselves. Then, optionally, add the skill to
`skills-meta.json` to give it:

- `group`: one of the groups listed at the top of the file
- `summary` and `whenToUse`: plain-English text for newcomers
- `deps`: skills it calls. The installer follows these down the whole chain
- `commands`: only if the commands pulled from `SKILL.md` are not good enough

A skill missing from `skills-meta.json` still shows up, under "Other", using its
`SKILL.md` description. The build **fails** if:

- a `deps` entry is not a folder in `.claude/skills/`
- a group is not listed in `groups`
- a skill folder has no `SKILL.md`, or any folder ends up missing from the manifest
- a file name has spaces or other characters the installers cannot handle safely

## Configuration

| Setting | Where | Used for |
|---|---|---|
| Site URL baked into the installers | `SITE_URL` env, else `VERCEL_PROJECT_PRODUCTION_URL` (Vercel, `https://` added), else `URL` (Netlify), else the placeholder `https://SET-SITE_URL-AT-BUILD-TIME.invalid` | `curl ... \| bash` cannot know where it came from, so the URL is written into the script |
| Desktop app releases repo | `RELEASES_REPO` env, else `releasesRepo` in `site.config.json` (default `Muhammad-uzair029/codeGem-releases`) | The "Download app" section |

On Vercel and Netlify the site URL is picked up automatically; you only need
`SITE_URL` for a custom domain. Commands shown on the web pages always use the
address in the browser bar, so they are correct even on preview deploys.
A placeholder build still works if the user sets `CODEGEM_SKILLS_URL=https://...`
when running the installer; without it, the installer stops with a clear message.

The "Download app" section asks the GitHub API for the latest release. While the
codeGem repo is private the API answers 404, so the section shows a link to
GitHub Releases instead (members signed in to GitHub can download from there).
It switches to per-platform buttons by itself once releases are public.

## Deploy

Both hosts deploy private GitHub repos. No secrets or servers are needed.

### Vercel

1. **Add New → Project**, import the codeGem repo.
2. Set **Root Directory** to `site`. Leave **Include files outside the root
   directory in the Build Step** on (it is on by default). The build reads
   `../.claude/skills/`, so it must stay on.
3. Deploy. `vercel.json` sets the build command, output folder, and headers.
4. Optional: add a custom domain, then set `SITE_URL=https://your.domain` and redeploy.

### Netlify

1. **Add new site → Import an existing project**, pick the codeGem repo.
2. Set **Base directory** to `site`. Netlify clones the whole repo, so
   `../.claude/skills/` is available. `netlify.toml` (in `site/`) sets the
   build command, `dist` as publish folder, Node 22, and headers.
3. Deploy.
4. Optional: custom domain, then set `SITE_URL` under Site configuration → Environment variables.

Both configs skip a deploy when a commit touches neither `site/` nor `.claude/skills/`.

## Files

```
site/
├── astro.config.mjs      integration that copies skills + writes manifest/installers
├── skills-meta.json      groups, summaries, dependencies (hand-maintained)
├── site.config.json      releases repo for the app download section
├── installers/           install.sh and install.ps1 templates (@@SITE_URL@@ is replaced)
├── lib/skills.mjs        reads .claude/skills, validates, resolves dependencies
├── lib/emit.mjs          writes dist/skills, manifest.json, installers; checks the result
├── scripts/smoke-install.sh
└── src/                  pages, components, styles, browser scripts
```
