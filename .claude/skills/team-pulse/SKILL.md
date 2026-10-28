---
name: team-pulse
description: Aggregates daily or weekly engineering activity across the team — commits, PRs opened/merged, reviews — from a configured list of repos and team members. Outputs a markdown digest saved to docs/team-pulse/ that the lead can paste into Notion/Slack/notes. Use when the user types "team-pulse", "/team-pulse", "weekly progress", "team activity", "who did what this week", or "team report".
---

## Objective
Give the team lead a clear, scannable answer to "what did everyone ship this week" without pinging anyone. Pulls signal from GitHub (the source of truth) into a markdown digest grouped per person.

## Config: `.claude/team.yaml`
The skill expects a config file at `.claude/team.yaml` in the project root. **Only `repos:` is required.** Authors are auto-detected from commit metadata (no roster needed). Schema:

```yaml
# Repos to scan — paste URLs in any of these formats:
#   https://github.com/owner/repo  |  github.com/owner/repo
#   owner/repo                      |  git@github.com:owner/repo.git
repos:
  - https://github.com/softaims/frontend-app
  - https://github.com/softaims/backend-api
  - https://github.com/softaims/ai-engine

defaults:
  window: weekly              # weekly | daily
  output_dir: docs/team-pulse
  group_by: repo              # repo | person | both
```

### URL normalization
Before any `gh` call, strip each repo entry to `owner/repo`:
- `https://github.com/X/Y` → `X/Y`
- `github.com/X/Y` → `X/Y`
- `git@github.com:X/Y.git` → `X/Y`
- `X/Y` → `X/Y` (pass through)
- Trim trailing `.git` and trailing `/`

### Auto-detect authors
The skill always reads authors directly from commit metadata — no roster needed:
- Use `gh api repos/<owner>/<repo>/commits` and group by `author.login`
- Fall back to `commit.author.name` if `author` is null (e.g., commits from users not on GitHub)
- Display name = GitHub login (or commit author name when login is unknown)
- Skip the "Quiet this week" section since there's no explicit roster to compare against

## Hard Rules
- **`gh` CLI required and authenticated.** If not, stop and tell the user to run `gh auth login`.
- **Read-only on remotes.** This skill never writes commits, PRs, or comments. Only `gh api` GET calls + `git log` reads.
- **No PII beyond GitHub handles + commit data.** Don't pull emails or surface secrets that may appear in commit messages — redact strings matching common secret patterns before writing the report.
- **Cache window in mind.** If the user asks for the same window twice in one day, reuse the prior digest file if it exists rather than re-querying.

## Execution Steps

### 1. Load config
Read `.claude/team.yaml`. If missing, ask the user for:
- list of team GitHub logins
- list of repos (owner/name)
- weekly or daily window default

Then write the config and continue.

### 2. Resolve the window
- `daily` — yesterday 00:00 → 23:59 (local time). On Monday, expand to Fri-Sun.
- `weekly` — previous Monday 00:00 → previous Sunday 23:59.
- Custom — accept "since YYYY-MM-DD" or "last 7 days" from the user.

Convert to ISO-8601 (`since`, `until`) for `gh` queries.

### 3. Pull activity per person, per repo (parallel)
For each `(person, repo)` pair, run in parallel:

```bash
# Commits authored
gh api -X GET "repos/<owner>/<repo>/commits" \
  -f author="<login>" -f since="<since>" -f until="<until>" \
  --paginate --jq '.[] | {sha: .sha[0:7], msg: .commit.message | split("\n")[0], date: .commit.author.date}'

# PRs opened in window
gh search prs --author="<login>" --repo="<owner>/<repo>" \
  --created="<since>..<until>" --json number,title,state,url,createdAt,mergedAt

# PRs reviewed in window
gh search prs --reviewed-by="<login>" --repo="<owner>/<repo>" \
  --updated="<since>..<until>" --json number,title,url,updatedAt
```

Throttle: max 10 concurrent `gh` calls. `gh` honors GitHub rate limits automatically.

### 4. Aggregate
For each team member:
- Commits → group by repo, count + first 3 subjects
- PRs opened → list with state badge (🟢 merged, 🟡 open, 🔴 closed-unmerged)
- PRs reviewed → count + titles
- Inferred focus area — derive from changed file paths (`apps/frontend/*` → frontend, etc.) if available via `gh pr view --json files`

### 5. Redact secrets in messages
Before writing, scan each commit message and PR title for:
- API key patterns (`sk-...`, `AKIA...`, `gh[pousr]_...`, `xox.-...`)
- Replace with `[REDACTED]`. Log how many were redacted in the report footer.

### 6. Write the digest
File path: `<output_dir>/<window>-<ISO-date-range>.md`
Example: `docs/team-pulse/weekly-2026-05-12_2026-05-18.md`

Render order depends on `defaults.group_by` from `.claude/team.yaml`:
- `repo`   — only the "By Repo" section
- `person` — only the "By Person" section
- `both`   — both, repo first (default)

**Audience: clients and non-technical stakeholders.** The digest is meant to be pasted directly into a client email / Notion / Slack — so the **Summary** and **Highlights** sections must be plain-language English. Translate Conventional Commit subjects (`feat(auth): add OAuth PKCE handler`) into outcomes a non-engineer understands (`Login via Google is now wired up`). Keep raw SHAs and Conventional Commit subjects only in the bottom "Commit Trail" section for technical reference.

Template:
```markdown
# Weekly Progress — <Mon DD> – <Mon DD>, <YYYY>

_Project: <repo or product name> · Reporting period: <Weekday, Mon DD> → <Weekday, Mon DD>, <YYYY>_

## Summary

<2–4 sentences in plain English describing what the team accomplished this week and why it matters. No jargon, no Conventional Commit syntax, no SHAs. Frame as outcomes ("login is now wired up", "payment retries are handled correctly") not implementation details ("added handleOAuthCallback function"). A non-technical client should be able to read this paragraph and understand the value delivered.>

## Highlights

<3–6 bullets. Each bullet: **bolded short headline.** then one plain-English sentence about the user-facing or business-facing impact. Translate technical work into outcomes:>

- **<Plain headline>.** <One-sentence outcome in plain language.>
- **Login via Google is now live.** Customers can sign in with their Google account instead of creating a separate password.
- **Payment retries handle network blips.** If Stripe times out, the system now retries automatically instead of failing the order.
- **Faster product search.** Search results now appear in under 200ms (previously 1.5s on average).

## Team

| Member | Commits | Pull Requests Opened | Reviews Given |
| --- | --- | --- | --- |
| <Full Name> (`<github-login>`) | <n> | <n> (🟢 <merged> · 🟡 <open>) | <n> |
| ...                            |     |                              |    |

_(If multiple repos, add one row per member with a per-repo breakdown in parentheses, e.g. "12 (frontend-app: 9, backend-api: 3)".)_

## Key Updates

<Meta-notes the client or lead should know. Window adjustments, anomalies, anyone quiet, anything redacted, what changed in workflow. Plain language.>

- <Window adjustment, if any. E.g. "The default reporting window had zero activity, so this report covers <date range> instead.">
- <Quiet members, if any roster-based. E.g. "Alice was on PTO this week — no contributions expected.">
- <Redactions, if any. E.g. "Two API-key-like strings in commit messages were redacted before this report was generated.">
- <Notable shifts. E.g. "No pull requests this week — all changes went directly to main during the bootstrap phase. PR-based review will resume next week.">

## Commit Trail (technical reference)

<For the engineering reader. Raw SHAs + Conventional Commit subjects, grouped by repo if multiple.>

- `<sha7>` — <conventional commit subject> — _<github-login>_
- ...

_(If multiple repos, group under `### <owner>/<repo>` subheadings.)_
```

**Plain-language translation cheatsheet** (apply when drafting Summary + Highlights):

| Conventional commit type | Plain-language framing |
| --- | --- |
| `feat(...)` adding a user-visible feature | "<Feature> is now live / available / wired up" |
| `feat(...)` adding internal infra | "Behind-the-scenes setup for <capability> is in place" |
| `fix(...)` user-facing bug | "<Symptom> no longer happens" |
| `fix(...)` developer-facing bug | "An issue that was affecting <area> internally has been resolved" |
| `perf(...)` | "<Operation> is now faster — <metric if known>" |
| `refactor(...)` | "Code in <area> was reorganized to make future changes safer/faster — no user-visible change" |
| `chore`/`build`/`ci` | Usually skip from Highlights unless it has business impact; mention in Key Updates if foundational |
| `docs` | "Documentation for <area> was updated" — skip unless the docs are client-facing |
| `test` | Skip from Highlights; mention in Key Updates only if it unlocks something visible |

**Hard rules for the client-facing sections:**
- No SHAs in Summary or Highlights.
- No `feat:` / `fix:` prefixes or scope parentheses in Summary or Highlights.
- No file paths, function names, or class names in Summary or Highlights.
- If a commit's plain-language outcome is genuinely "internal plumbing with no client value", omit it from Highlights — it still appears in the Commit Trail.
- Keep paragraphs short. Aim for the Summary to be readable in under 20 seconds.

### 7. Report
Print to the user:
- File path written
- One-line per-person summary (name + commits + PRs)
- Anyone with zero activity (so lead can check in)

## Usage Examples
- `team-pulse` → use defaults from config (weekly)
- `team-pulse daily` → yesterday only
- `team-pulse since 2026-05-10` → custom window from date to today
- `team-pulse for alice-dev` → single-person digest

## Output Style
Status lines from the skill match active session tone. The digest markdown itself stays normal prose so it's pasteable into Notion / Slack / Confluence without rewriting.
