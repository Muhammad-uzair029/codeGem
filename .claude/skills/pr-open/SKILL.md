---
name: pr-open
description: Creates a GitHub pull request from the current branch — auto-fills title, summary, and test-plan checklist from the diff against the base branch. Pushes the branch if needed, then opens the PR via `gh pr create`. Use when the user types "pr-open", "/pr-open", "open a PR", "raise a PR", or "create pull request".
---

## Objective
Eliminate the 5-minute ritual of writing PR title/body/test plan by hand. Generate them from the diff, confirm with the developer, then open the PR.

## Hard Rules
- **Never open a PR from `main` / `master` / `develop`.** Refuse if current branch is one of these.
- **Never force-push.** If the remote branch diverged, surface the error and stop.
- **Never skip hooks** unless the user explicitly asks.
- **Confirm before pushing AND before opening.** Two gates — one to push, one to open. Each push is a separate intent.
- **`gh` CLI is required.** If `gh` isn't installed or authenticated, stop and tell the user to run `gh auth login`.

## Execution Steps

### 1. Pre-flight
Run in parallel:
- `git rev-parse --is-inside-work-tree` — confirm git repo
- `gh auth status` — confirm gh is logged in
- `git branch --show-current` — current branch
- `git status --short` — uncommitted changes
- `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` — base branch (usually `main`)

Abort if:
- Not in a git repo
- `gh` not authenticated
- Current branch is the default branch
- Uncommitted changes exist (ask user to commit first via `git-push`)

### 2. Gather diff context
Run in parallel against the base branch:
- `git log <base>..HEAD --oneline` — all commits on this branch
- `git diff <base>...HEAD --stat` — file-level summary
- `git diff <base>...HEAD` — full diff (truncate if huge)

### 3. Draft PR content

**Title** — pulled from the most descriptive commit subject OR synthesized from the diff. ≤ 70 chars. Conventional-commit style prefix (`feat:`, `fix:`, etc.) matching the dominant change type.

**Body** — use this template:
```markdown
## Summary
- <bullet 1: what changed and why>
- <bullet 2>
- <bullet 3, if needed>

## Changes
- `path/to/file.ts` — short note
- `path/to/other.py` — short note

## Test Plan
- [ ] <how to manually verify the golden path>
- [ ] <edge case to check>
- [ ] <regression area to watch>

## Notes
<only if there's something a reviewer must know: breaking change, follow-up needed, etc. Omit otherwise.>
```

Keep bullets tight. Reference file paths, not line ranges.

### 4. Push branch (if needed)
Check `git rev-parse --abbrev-ref --symbolic-full-name @{u}` for tracking branch.
- If branch has upstream and is in sync — skip push
- If branch has upstream but is ahead — `git push`
- If no upstream — `git push -u origin <current-branch>`

Show the developer: branch name, commits to push, target remote. Ask: **"Push branch? (yes / cancel)"**

### 5. Open PR
Show the drafted title + body and the base branch. Ask: **"Open PR against `<base>`? (yes / edit title / edit body / cancel)"**

On `yes` — run:
```bash
gh pr create --base <base> --head <current-branch> --title "<title>" --body "$(cat <<'EOF'
<body>
EOF
)"
```

On `edit title` or `edit body` — accept revision, re-show, re-ask.

### 6. Report
Return:
- PR URL (from `gh pr create` output)
- One-line summary: "PR #N opened against `<base>` — <title>"

## Output Style
Match active session tone. Terse fragments OK. PR content itself stays normal prose.
