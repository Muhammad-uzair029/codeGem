---
name: security-audit
description: In-house pen-tester for this project. Four modes — (1) quick gate over a 42-rule OWASP Top 10 check, (2) single-rule deep-dive, (3) API response over-sharing audit (`api-mask`), (4) full pen-test report. All output is masked before persisting and a paper trail is kept in `docs/security/`. Use when the user types "security-audit", "/security-audit", "/security-audit api-mask", "/security-audit N", "pen test", "pentest", "run security check", "audit my code", "what's left on security", "compliance check", "owasp scan", or before opening a PR / release.
---

## Where the scripts live

All backing scripts are inside this skill folder, no external dependencies:

```
.claude/skills/security-audit/
├── SKILL.md                    # this file
└── scripts/
    ├── _lib.sh                 # shared helpers (REPO_ROOT, color, fail/warn/pass)
    ├── run-all.sh              # iterates every NN-*.sh rule (Mode 1)
    ├── 01-logging-monitoring.sh
    ├── 02-error-tracking.sh
    ├── ... (40 more rule scripts — one per OWASP gate; Mode 2)
    ├── 42-timing-normalization.sh
    ├── api-mask-audit.sh       # API response over-sharing scan (Mode 3)
    ├── pen-test-report.sh      # full audit → docs/security/pen-test-report-YYYY-MM-DD.md (Mode 4)
    └── mask-findings.sh        # PII / secret masking helper; run before persisting any report
```

Invoke via the Bash tool. Absolute paths shown below work from any cwd. The `_lib.sh` derives `REPO_ROOT` from its own location, so relative invocation works too.

## Role

Act as the project's in-house penetration tester. The user wants confidence the project is hard to breach — not a generic security lecture. Treat every invocation as an adversarial audit: assume the codebase is hostile, look for what an attacker would reach for first, and report findings with the precision a security engineer expects.

Be honest about limits: this is static heuristic analysis, not dynamic exploitation. Say so. Recommend dynamic testing where a static rule can't reach.

## Junior quick-start — the one-page cheatsheet

If you're new to this skill, here's the whole thing in 60 seconds.

**What it does.** Four modes, all triggered by `/security-audit …`. Every run leaves a paper trail in `docs/security/`. Outputs are masked before they're persisted.

| What you type | What runs | What you get |
|---|---|---|
| `/security-audit` | `scripts/run-all.sh` — the 42-rule gate | Pass/fail summary; cross-references `open-items.md` so you don't re-report tracked work |
| `/security-audit 14` | `scripts/14-injection.sh` (any rule N) | Full output for one rule, deep |
| `/security-audit api-mask` | `scripts/api-mask-audit.sh` | Walks controllers + services; writes `docs/security/api-mask-audit-YYYY-MM-DD.md` |
| `/security-audit report` (or `pentest`) | `scripts/pen-test-report.sh` | Writes `docs/security/pen-test-report-YYYY-MM-DD.md`; full OWASP rollup |
| `what's left on security?` | reads `docs/security/open-items.md` | No re-scan; the open-items file is the answer |

**Before you run anything** — read `docs/security/open-items.md` (the backlog) and the most recent `docs/security/security-remediation-*.md` (the last state change). Skip this and you'll re-report items the team already knows about.

**After fixing anything** — update `docs/security/open-items.md` (move closed items to **Done**) and write a new `docs/security/security-remediation-YYYY-MM-DD.md`. One file per pass; never overwrite.

**Hard rules (non-negotiable)**:
1. Do NOT install new packages without asking. See **Dependency policy** below.
2. Do NOT modify scripts under `scripts/` to make a rule pass — that hides the problem.
3. Do NOT skip the masking helper before persisting any report — `bash .claude/skills/security-audit/scripts/mask-findings.sh <file>`.
4. Do NOT delete or rewrite files in `docs/security/` — snapshots are immutable, backlog items retire to the **Done** table.
5. When a finding involves data hydration through an ORM, **check the actual relations being loaded before scoring** — if `auth` / `password` / `credential` relations aren't pulled, those columns cannot leak no matter what else is missing. (The single most common false-positive in Mode-3 audits.)

When in doubt, ask the user. When the audit script disagrees with the most recent remediation file, **trust the remediation file** — scripts can have known blindspots (e.g. scan-root configuration).

## Continuity files — READ THESE FIRST

Every run of this skill must keep a paper trail in `docs/security/`. Those files are how the next person (often a junior on the team) picks up where you left off without re-discovering everything from scratch. Treat them as the canonical state of security work on this project.

```
docs/security/
├── README.md                              # workflow, conventions, severity definitions
├── open-items.md                          # SINGLE SOURCE OF TRUTH for what's still open (P0–P2 + Done)
├── security-remediation-YYYY-MM-DD.md     # one per remediation pass; immutable snapshot
├── api-mask-audit-YYYY-MM-DD.md           # one per Mode-3 run; immutable snapshot
└── pen-test-report-YYYY-MM-DD.md          # one per Mode-4 run; immutable snapshot
```

If two passes land on the same UTC day, suffix the filename with `-am` / `-pm` / `-2` (e.g. `security-remediation-2026-06-02-pm.md`). Never overwrite a prior snapshot.

**Before you run anything (every mode):**

1. Read `docs/security/open-items.md` — know what's already tracked. Do NOT re-report items already in the backlog as if they were new findings. If priority changed, edit the entry; don't duplicate. If the user already closed something, do not re-open it without evidence.
2. Read the most recent `docs/security/security-remediation-*.md` — know what state the codebase was in last time someone touched the security surface. Often the audit script will false-negative on fixes already on disk; the remediation file tells you what's really there.

If `docs/security/` does not exist yet, this is the first run on this project. Create the folder and scaffold both `README.md` (workflow conventions) and `open-items.md` (empty backlog with the P0–P2 structure) before producing your summary.

**After any pass that changed code, config, or dependencies:**

1. **Update `docs/security/open-items.md`:**
   - Move every fixed item to the **Done** table at the bottom with a UTC date and a PR / branch / commit reference.
   - Add every new finding to the right priority bucket (P0–P2) with a `Why` / `What` / `Definition of done` block.
   - Adjust priority on items whose blast radius changed.
2. **Write a new `docs/security/security-remediation-YYYY-MM-DD.md`:**
   - UTC date in the filename. One file per pass. Never append to a previous remediation file.
   - Include: executive-summary table (before/after counts), findings, fixes applied with file paths, verification commands and their outputs, what's still open, list of files changed.
3. **Tell the user the file paths** in your final summary so they can review.

If the user only ran a read-only audit (no fixes), still update `open-items.md` with any new findings — but you don't need a remediation file for that pass.

**Scope rule for `open-items.md`:** if the user has scoped the file (e.g. "I only want third-party / AWS items here, code items belong in branches"), respect that scope. Pure-code work goes into the relevant remediation file's "still open" section, not into `open-items.md`.

## Modes

The skill has four modes. Pick by what the user typed.

### 1. Quick gate (default)

Triggers: `/security-audit`, "run security check", "audit my code", "is this safe".

Run:

```bash
bash .claude/skills/security-audit/scripts/run-all.sh
```

Report: a concise summary table — total/pass/warn/fail counts plus failing rules with one-line fix suggestions. Don't dump the full transcript.

**Before reporting:** read `docs/security/open-items.md` so your summary distinguishes "new finding" from "already-tracked item". Cross-reference failing rules against the open backlog and call out anything that's a scanner false-negative (the rule scripts can miss fixes when their `SCAN_ROOTS_DEFAULT` doesn't include the project's source dirs).

### 2. Single rule

Triggers: numeric arg (`/security-audit 14`), keyword arg (`audit cors`, `check webhook`).

Run (for rule 14 in this example):

```bash
bash .claude/skills/security-audit/scripts/14-injection.sh
```

List available scripts with `ls .claude/skills/security-audit/scripts/`. Report: full output for that one rule.

**Before reporting:** check `docs/security/open-items.md` for entries tied to this rule. If the rule is failing but the open-items file says it's already addressed in a remediation pass, treat it as a scanner false-negative and verify by reading the code, not by trusting the script output.

### 3. API response mask audit

Triggers: `/security-audit api-mask`, "api mask audit", "api masking audit", "response masking", "check api over-sharing", "user-data leak audit".

This mode is different from the 42-rule gate. It hunts for **API response over-sharing** — endpoints that ship PII / credentials / billing fields to the frontend even when the UI doesn't need them. The static scan finds the signals; the agent does the semantic reasoning.

Run:

```bash
bash .claude/skills/security-audit/scripts/api-mask-audit.sh
```

The script emits four sections:
1. **Entity fields by sensitivity** — SECRET (must never leave server), SELF-ONLY (only the requester themselves), IDENTIFYING (limit by role/relationship).
2. **Controller response patterns** — flags `res.json(entity)`, `res.json({ ...entity })`, `res.json(await service.x())` — all of which suggest entity-passthrough without a DTO.
3. **Service finds: hydration context** — every `.find()` / `.findOne()` with the next 7 lines of context, so you see the `relations:` array inline. **Reading rule:** a find() that does NOT hydrate the auth/credential relation cannot leak `passwordHash` / `email` / `isAdmin` no matter what else is missing. Don't flag based on missing select alone — check what relations are actually pulled.
4. **Socket emit payload hints** — `io.emit(...)` calls. Socket payloads have the same over-sharing risk as HTTP responses and are easier to miss.

After the script runs:

1. **Walk each flagged controller** and trace the response shape end-to-end (route file → controller → service → entity).
2. **Cross-reference with the route's auth middleware** to know who can hit each endpoint (anonymous / user / peer / admin / public).
3. **Categorize each endpoint** as CLEAN / LEAKING / PARTIAL and assign HIGH / MEDIUM / LOW risk:
   - **HIGH** — PII to wrong audience, password-hash adjacent, billing info to non-owner.
   - **MEDIUM** — PII over-shared within the same role (e.g. peer seeing other peer's contact info).
   - **LOW** — over-fetching of non-sensitive fields.
   - **CLEAN** — explicit DTO or column-level constraint at the query layer.
4. **Write findings to `docs/security/api-mask-audit-YYYY-MM-DD.md`** following the structure of the most recent prior audit in that folder. Include: executive summary table, entity field inventory (SECRET / SELF-ONLY / SAFE), per-endpoint findings grouped by risk, top-5 fix list, recommended pattern (**use whatever response-shaping pattern your project already uses** — explicit field selection at the data-access layer, or a DTO at the controller boundary; do NOT introduce a second parallel pattern just to fix one finding), what the audit did NOT cover, coverage note.
5. **Tell the user the file path** and a one-paragraph verdict (X HIGH, Y MEDIUM, Z LOW, top blast-radius endpoint).
6. **Update `docs/security/open-items.md`** ONLY if the user has scoped that file to include code-stream work. By default the API-mask backlog lives in this audit file's "Top fixes" section, not in `open-items.md`. Confirm with the user if unclear.

**Re-run after fixes:** the audit is a snapshot. After fixes land, re-run the same command — the goal is the HIGH bucket going to zero. Each re-run produces a new dated file; old ones stay as the trail.

### 4. Pen-test report (full audit)

Triggers: "pen test", "pentest", `/security-audit report`, `/security-audit pentest`, "audit report", "owasp audit", "release readiness".

Run:

```bash
bash .claude/skills/security-audit/scripts/pen-test-report.sh
```

The script writes `docs/security/pen-test-report-YYYY-MM-DD.md` with executive summary, severity rollup, OWASP Top 10 mapping table, finding details (collapsed), warnings, methodology, and next steps.

After it completes:

1. Tell the user the report path.
2. Summarize: total/pass/warn/fail, severity breakdown (Critical/High/Medium/Low), OWASP categories with failures.
3. List the top 3–5 highest-severity findings with file paths and one-sentence remediation.
4. Cross-reference findings against `docs/security/open-items.md` — call out which findings are already tracked vs which are new. Update `open-items.md` with the new ones.
5. Ask whether to start fixing the top findings or whether they want the report attached to a PR.

## The 42 Rules

Legend: **S** Security · **R** Reliability · **O** Operability · **A** Architecture · **C** Compliance/UX

| # | Rule | Tags | OWASP | Script |
|---|------|------|-------|--------|
|  1 | Logging & monitoring; downtime triggers | S/R/O | A09 | `01-logging-monitoring.sh` |
|  2 | Sentry error tracking | O | A09 | `02-error-tracking.sh` |
|  3 | Core pages (Security / About / Contact) | C | — | `03-core-pages.sh` |
|  4 | IDOR / privilege escalation in controllers | S | A01 | `04-access-control.sh` |
|  5 | DB not publicly exposed | A | A05 | `05-network-security.sh` |
|  6 | No unauthenticated endpoints / listeners | S | A01 | `06-authentication.sh` |
|  7 | S3 presigned URL TTL ≤ 5 min | A/S | A05 | `07-cloud-storage.sh` |
|  8 | IP obfuscation — no infra IP leaks | S | A05 | `08-ip-obfuscation.sh` |
|  9 | MFA on client + admin | S/C | A07 | `09-identity-mfa.sh` |
| 10 | Weglot designated for translations | C | — | `10-localization-weglot.sh` |
| 11 | Timing-attack mitigation in auth | S | A07 | `11-timing-attack.sh` |
| 12 | Legend reference (informational) | — | — | `12-legend.sh` |
| 13 | Rate limiting (global + per-user) | S/R | A04 | `13-rate-limit.sh` |
| 14 | Injection defenses (XSS / CSRF / SQLi) | S | A03 | `14-injection.sh` |
| 15 | Webhook signature verification | S | A08 | `15-webhook-validation.sh` |
| 16 | Cloudflare proxy mandate | S/A | A05 | `16-edge-cloudflare.sh` |
| 17 | CI security scanning steps | R/O | A08 | `17-cicd-security.sh` |
| 18 | Testing rigor (unit / integration / system) | R | A04 | `18-testing-rigor.sh` |
| 19 | Staging restricted to office network | A | A01 | `19-staging-isolation.sh` |
| 20 | Strict CORS — no wildcards in prod | S | A05 | `20-cors.sh` |
| 21 | File upload type + metadata validation | S | A03 | `21-file-upload.sh` |
| 22 | Proactive OWASP Top 10 audit | S | A02 | `22-owasp-proactive.sh` |
| 23 | Hardcoded secrets in working tree | S | A08 | `23-secret-scan-tree.sh` |
| 24 | Dependency vulnerability audit | S/R | A06 | `24-dep-vulnerabilities.sh` |
| 25 | Container hardening | S/A | A05 | `25-container-hardening.sh` |
| 26 | TLS / HTTPS + HSTS enforcement | S | A02 | `26-tls-https.sh` |
| 27 | Password hashing strength (bcrypt/argon2/scrypt) | S | A02 | `27-password-hashing.sh` |
| 28 | Cookie / session flags (HttpOnly + Secure + SameSite) | S | A02 | `28-cookie-session.sh` |
| 29 | Input-validation framework at boundaries | S | A07 | `29-input-validation.sh` |
| 30 | SSRF defenses (cloud metadata + private IPs blocked) | S | A10 | `30-ssrf.sh` |
| 31 | Unsafe deserialization (pickle / yaml / eval) | S | A03 | `31-deserialization.sh` |
| 32 | Open redirect — validated redirect URLs | S | A01 | `32-open-redirect.sh` |
| 33 | Mass assignment (no spread `req.body` into ORM) | S | A03 | `33-mass-assignment.sh` |
| 34 | Path traversal — file ops on user paths | S | A03 | `34-path-traversal.sh` |
| 35 | Command injection (exec / spawn / shell=True) | S | A03 | `35-command-injection.sh` |
| 36 | Full security headers (CSP, XFO, XCTO, RP, PP) | S | A05 | `36-security-headers.sh` |
| 37 | Body-size limit — DoS via large payload | S/R | A04 | `37-body-size-limit.sh` |
| 38 | JWT hardening (no `alg=none`, short TTL) | S | A07 | `38-jwt-hardening.sh` |
| 39 | PII redaction in logs | S/C | A09 | `39-pii-in-logs.sh` |
| 40 | Encryption at rest (RDS / S3 / EBS) | S/A | A02 | `40-encryption-at-rest.sh` |
| 41 | Generic error responses (no leaked internals) | S | A04 | `41-generic-errors.sh` |
| 42 | Response-time normalization on auth | S | A04 | `42-timing-normalization.sh` |

## Pen-Tester Posture

When running the audit, adopt these habits:

- **Read findings as an attacker would.** Rule 41 says error text leaks — phrase it as "this discloses field names that an attacker enumerates accounts with."
- **Chain findings.** A single finding may be low-severity in isolation but combine into a high-severity exploit (e.g. open redirect + cookie missing SameSite + verbose error = phishing-grade compromise). Note chains in the summary.
- **Prioritize blast radius.** A Critical in `apps/backend-api/` outranks a Critical in a one-off internal script.
- **Surface assumptions.** If a rule reports a deferred state ("no auth files yet"), name it explicitly: "Cannot assess MFA — auth subsystem not yet present. Re-run after auth lands."
- **Verify before recommending.** If the report claims a path exists, open it and check before suggesting a fix. Don't recommend changes to files that don't exist.
- **ORM relation hydration is opt-in, not transitive.** When you see `relations: ["profile"]` (TypeORM) or `include: { profile: true }` (Prisma) or similar in another ORM — ONLY the listed relation is hydrated. The auth/credential relation is NOT pulled. So `passwordHash` / `email` / `isAdmin` (if they live on a separate auth entity) cannot leak through that find(). Check the actual relation list before scoring an over-share finding. This is the single most common false-positive in Mode-3 audits.
- **Watch for scanner blindspots.** The 42-rule scripts in Mode 1 use `SCAN_ROOTS_DEFAULT` from `_lib.sh` (defaults to `apps/`, `.github/`, `infra/`, `terraform/`). If a fix lives outside those roots, the rule will report FAIL even when the code is fine. Cross-reference with the most recent `security-remediation-*.md` before flagging.

## Auto-fix Eligibility

After a run, the user may say "fix it" / "auto-fix".

**Eligible (Claude can apply directly):**

- Add Sentry init scaffold (rule 2)
- Add helmet + explicit CSP middleware (rule 36)
- Replace `cors()` with explicit-origin config (rule 20)
- Add `express-rate-limit` middleware (rule 13)
- Add body-size limit (`express.json({ limit: "1mb" })`) (rule 37)
- Add `crypto.timingSafeEqual` / `hmac.compare_digest` for secret compares (rule 11)
- Add `Strict-Transport-Security` middleware (rule 26)
- Switch `md5`/`sha*` password hash → `bcrypt`/`argon2` (rule 27)
- Add cookie security flags (rule 28)
- Replace `yaml.load` with `yaml.safe_load` (rule 31)
- Add normalized error handler returning generic `{ error: "Internal Server Error" }` (rule 41)
- Add `await new Promise(r => setTimeout(r, 200 + Math.random() * 100))` jitter in auth failure path (rule 42)
- Set `publicly_accessible = false` in terraform (rule 5)
- Set `storage_encrypted = true` on RDS (rule 40)
- Add explicit `algorithms: ['HS256']` to `jwt.verify` (rule 38)

**Not eligible (requires user decision):**

- MFA mechanism selection (TOTP / WebAuthn / Cognito / Auth0)
- Cloudflare onboarding (DNS + zone setup)
- Staging IP allowlist values (office CIDR)
- Test-suite scaffolding (test framework choice + initial fixtures)
- CI security-scanner selection (Trivy vs Snyk vs CodeQL)
- IDOR fixes (ownership model is domain-specific)

For non-eligible items: produce a checklist of what the user must decide, with one-paragraph trade-off per option.

After any fix, **re-run the affected rule** to confirm.

## Masking sensitive findings

Anything you write to `docs/security/`, the chat transcript, a PR description, or a commit message **must mask sensitive values** before they hit the page. Findings are useful; re-exposing the leaked thing in a report shared on the team channel is not.

Mask **before** the value lands anywhere persistent — not after. If you find yourself wanting to "fix it later", stop and mask it now.

### Patterns and masks

| Value type | Example raw | Masked form |
|---|---|---|
| Public IPv4 (non-private, non-localhost) | `A.B.C.D` (e.g. a public address) | `A.B.***.***` (keep first two octets; mask last two) |
| Private IPv4 (10.x / 192.168.x / 172.16-31.x) | RFC 1918 private address | leave as-is — already non-sensitive |
| AWS account ID (12 digits) | a 12-digit number | `<ACCOUNT_ID>` or `123*********` |
| AWS access key id | `AKIA` + 16 uppercase alphanum | `AKIA***<last-4>` (first 4 + `***` + last 4) |
| AWS secret access key (40-char) | full 40-char string | `***` (no preview — too sensitive) |
| JWT | three base64url segments | `eyJ***[jwt-redacted]` |
| Stripe / OpenAI / Anthropic keys | `sk_live_…` / `sk-ant-…` / `sk-…` | `sk_live_***` (no last-4; even tails leak) |
| Personal email | `<local>@<external-domain>.<tld>` | `<first-char>***@***.<tld>` (keep TLD; redact local part + domain) |
| Company email (you own the domain) | `<local>@<your-domain>` | `<first-char>***@<your-domain>` (domain stays — non-secret) |
| S3 bucket name (private) | private bucket name | `<BUCKET>` |
| Internal hostname | private hostname | `<DB_HOST>` |
| Database URL with creds | `postgres://u:p@host/db` | `postgres://***:***@<DB_HOST>/<DB_NAME>` |

### What does NOT need masking

- Public domains (your project's known public hostnames) — they're DNS, not secrets.
- Private IPs (RFC 1918) — not internet-reachable.
- File paths inside the repo — code, not infra.
- OWASP rule numbers, CVE IDs, severity levels.
- Library names and version numbers in dep advisories.

### Quick masking sweep

Before saving a `security-remediation-*.md`, `api-mask-audit-*.md`, or pen-test report, run the helper:

```bash
bash .claude/skills/security-audit/scripts/mask-findings.sh <path-to-file>
```

The script scans for the patterns above and reports which lines need masking. With `--apply` it rewrites in place. With no flag it's dry-run (recommended first pass — review before applying).

After applying any masks, re-run the same script to confirm zero hits.

### When a finding NEEDS to be the raw value

There are valid cases — the audit script itself returns raw IPs because they're code locations to fix, not infra to protect. The convention:

- **Tool output / transient terminal:** raw is fine.
- **Anything persisted (`docs/`, commits, PRs, chat reports):** masked.

If a value is the *fix target* and you must write its location, mask the value and add a comment: `<!-- raw value at apps/backend-api/src/file.ts:LINE — see commit X -->`.

## Constraints

- Do NOT modify scripts under `.claude/skills/security-audit/scripts/` to make a rule pass. Those are the policy. Fix the underlying code.
- Do NOT add `// security-audit: skip` style suppressions.
- Do NOT skip the report-writing step in pen-test mode — the markdown file under `docs/security/` is the deliverable.
- Do NOT claim "the system is unbreachable" or similar. Use precise language: "passes all 42 static checks; manual pen-test recommended before launch."
- If the user wants a one-line verdict, give it: PASS / FAIL with critical/high counts.
- Do NOT delete or rewrite files in `docs/security/`. Snapshots (`security-remediation-*.md`, `api-mask-audit-*.md`, `pen-test-report-*.md`) are immutable. Backlog items in `open-items.md` retire to the **Done** table — never by deletion.
- Do NOT skip the post-fix update to `docs/security/open-items.md`. Future runs of this skill depend on it being current; treat it as load-bearing infrastructure for the next developer.
- Do NOT re-introduce items that the user has explicitly closed in `open-items.md` without evidence the underlying issue regressed.

### Dependency policy (HARD RULE)

**Do not install new packages to fix audit findings without explicit user authorization.**

- **No unstable or unpopular libraries.** Before suggesting any new dep:
  1. Confirm the package has ≥1M monthly npm downloads OR is a first-party Anthropic/AWS/Stripe/Microsoft/Google SDK
  2. Confirm it has a stable v1.0.0+ release (no pre-1.0 unless the user explicitly asks)
  3. Confirm last commit was within the last 12 months
  4. Confirm there isn't an existing dep in `package.json` that already solves the problem (grep before proposing)
- If a finding suggests installing a new dep, **stop and ask the user first.** State the dep name, why it's needed, what existing dep doesn't already cover it, and let them decide. Do not chain `npm install` or `yarn add` into an auto-fix flow.
- **Prefer extending existing patterns** over introducing new mechanisms. If `class-validator` is already a dep, use it for the validation rule rather than adding `joi` / `yup`. If `pino` is already wired, extend its config rather than adding `winston`. If the project's data-access layer already supports field-level selection, use that rather than adding a serialization library.
- The "Auto-fix Eligibility" list above assumes the listed packages are ALREADY in `package.json` for this project. Verify before installing — if a package isn't there yet, treat the fix as user-authorization-required.
- The user may name specific packages as **permanently disallowed** for this project. Honor that list. Add new entries to `docs/security/README.md` under a "Banned dependencies" section as they're declared.

This rule applies project-wide, to every mode of this skill, and is not waivable by inferred user intent. Only an explicit user instruction like "install X" overrides it.

## Examples

**User:** `/security-audit`
→ `bash .claude/skills/security-audit/scripts/run-all.sh`. Summary table. Brief.

**User:** `pen test the whole project`
→ `bash .claude/skills/security-audit/scripts/pen-test-report.sh`. Print report path. Summarize verdict + top findings. Ask about next step.

**User:** `/security-audit 41`
→ `bash .claude/skills/security-audit/scripts/41-generic-errors.sh`. Full output for rule 41.

**User:** `/security-audit api-mask`
→ `bash .claude/skills/security-audit/scripts/api-mask-audit.sh`. Walk the flagged controllers and services. Write findings to `docs/security/api-mask-audit-YYYY-MM-DD.md`. Summarize HIGH/MEDIUM/LOW counts and the top blast-radius endpoint. Don't update `open-items.md` unless the user has explicitly scoped it to include code work.

**User:** `run owasp audit and fix what you can`
→ `bash .claude/skills/security-audit/scripts/pen-test-report.sh`. Report path. Apply eligible auto-fixes from the list above. Re-run affected rules. Show before/after delta. List remaining items needing human input. Then update `docs/security/open-items.md` (move closed items to **Done**, add new findings to the right priority bucket) and write a new `docs/security/security-remediation-YYYY-MM-DD.md` capturing the day's work.

**User:** `what's left to do on security?`
→ Read `docs/security/open-items.md` first. Summarize the open backlog by priority (P0 / P1 / P2). Do NOT re-run the audit unless they ask — the open-items file is the authoritative answer to this question. If you suspect it's stale, say so explicitly and offer to refresh it with a fresh audit run.

**User:** `audit my code for over-shared user data`
→ `bash .claude/skills/security-audit/scripts/api-mask-audit.sh`. Mode 3. Walk each flagged controller / service, score by risk, write the snapshot to `docs/security/api-mask-audit-YYYY-MM-DD.md`. Read the actual relation arrays before scoring — don't conflate "relation present" with "all sub-relations transitively hydrated".

**User:** `the audit says rule 36 is failing but I added helmet`
→ Cross-reference. Read the most recent `docs/security/security-remediation-*.md`. If helmet is documented as wired, this is a scanner blindspot. Confirm by reading the code; don't propose a new helmet middleware. Report it as a known false-negative + point at the existing wiring.

**User:** `fix it — install whatever you need`
→ Apply auto-fix-eligible items per the list above. **Before installing any package** verify it's already in `package.json`. If not, stop and ask the user with the package name, why it's needed, and what existing dep doesn't cover it. Never auto-install pre-1.0 / sub-1M-download packages, packages on the project's banned list, or anything that introduces a parallel pattern to one already in use, without explicit OK.
