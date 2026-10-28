---
name: security-scan
description: Scans staged diff for hardcoded secrets, credentials, API keys, and known-vulnerable dependencies. Blocks commits that contain secrets and warns on dep vulnerabilities. Use when the user types "security-scan", "/security-scan", "secret check", "scan for secrets", or as a pre-commit gate.
---

## Objective
Stop secret leaks before they hit `git push`. Once a secret reaches the remote, it's compromised even if reverted. This is a hard gate — never let one through.

## Hard Rules
- **Block on any high-confidence secret match.** No exceptions, no "looks like a test value" overrides without explicit user confirmation.
- **Scan staged content only** — `git diff --cached` — not the working tree. Don't pick up secrets the dev already cleared.
- **Surface line + masked preview.** Show enough to identify the leak without re-exposing it in chat.
- **Dependency check is advisory.** Flag known vulns but don't block (handled by CI/dep tooling).

## Secret Patterns to Detect

### High-confidence (hard block)
- **AWS keys** — `AKIA[0-9A-Z]{16}` (access key id), `aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{40}`
- **GCP keys** — `"type":\s*"service_account"`, `-----BEGIN PRIVATE KEY-----`
- **GitHub tokens** — `gh[pousr]_[A-Za-z0-9_]{36,}`, `github_pat_[A-Za-z0-9_]{82}`
- **Slack tokens** — `xox[abprs]-[A-Za-z0-9-]+`
- **Stripe** — `sk_live_[A-Za-z0-9]{24,}`, `rk_live_[A-Za-z0-9]{24,}`
- **OpenAI / Anthropic** — `sk-[A-Za-z0-9]{32,}`, `sk-ant-[A-Za-z0-9-_]{90,}`
- **JWT in code** — `eyJ[A-Za-z0-9_=-]+\.eyJ[A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+`
- **Private keys** — `-----BEGIN (RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----`
- **Generic high-entropy** — strings ≥ 32 chars matching `[A-Za-z0-9+/=_-]+` assigned to vars named `*secret*`, `*token*`, `*key*`, `*password*`, `*api_key*`, `*apikey*`
- **`.env` file content** — any staged file matching `**/.env`, `**/.env.*` (except `.env.example`, `.env.template`)
- **Database URLs with creds** — `(postgres|mysql|mongodb)://[^:]+:[^@]+@`

### Medium-confidence (warn)
- Hardcoded URLs to localhost / internal IPs (may leak infra topology)
- Email + password pairs in source
- IPv4 in non-test code (`192.168.*`, `10.*` private ranges)
- Comments like `// TODO remove before commit`, `// real key:`

## Execution Steps

### 1. Pull the staged diff
```bash
git diff --cached --unified=0
git diff --cached --name-only --diff-filter=ACMR
```

### 2. Run pattern matches
For each pattern, search added lines (`^+` in diff, not `+++` headers). Capture:
- File + line number
- Pattern name (e.g., "AWS access key")
- Masked preview: first 4 chars + `***` + last 4 chars

### 3. False-positive guardrails
Allow-list patterns that match but are clearly safe:
- File path contains `test`, `spec`, `fixture`, `mock`, `example`
- Value matches obvious placeholders: `xxxxxxxxxxxx`, `your-key-here`, `<API_KEY>`, `${ENV_VAR}`, `process.env.X`
- Inside a comment that says `// example:` / `# example:`

Still report these as INFO so the dev can sanity check.

### 4. Dependency check (advisory)
If `package.json` or `requirements.txt` is staged:
- JS: `npm audit --audit-level=high --json 2>/dev/null | head -50`
- Python: `pip-audit --strict 2>/dev/null` if available

Report high/critical findings only. Don't block.

### 5. Output format
```
security-scan results

HARD BLOCK — secrets detected:
  src/config.ts:14 — Stripe live key — sk_l***x2Qa
  .env:3 — staged .env file — FILE BLOCKED

WARN — review before commit:
  src/api.ts:88 — possible internal IP — 10.0.***.42

INFO — dep vulnerabilities (advisory):
  axios@0.21.1 — CVE-2021-3749 (high) — upgrade to ≥0.21.4

Action: unstage the offending lines. Use git restore --staged <file> and remove the secret.
```

### 6. Exit code
- 0 — clean (no HARD findings)
- 2 — HARD BLOCK (secrets present, refuse commit)
- 1 — only WARN/INFO findings

## Output Style
Scan output stays normal prose. Status from the skill matches active session tone.
