# QA report: {{FEATURE_NAME}}

**Verdict: {{PASS | PASS WITH ISSUES | FAIL | BLOCKED}}** — {{one-sentence reason}}

| Run | Value |
|-----|-------|
| Date | {{DATE}} |
| Build / commit | {{git short sha + branch, or `unknown` if git isn't available}} |
| Browsers / viewports | {{e.g. Chrome 1440×900, Pixel 7}} |
| Cases | {{N}} ({{P0}} P0 · {{P1}} P1 · {{P2}} P2) |
| Result | {{passed}} passed · {{failed-as-known-bug}} known bugs · {{flaky}} flaky (after 3× repeat) |
| Re-run | `{{exact command}}` |

## Traceability
| AC | Case | Test | Result |
|----|------|------|--------|
| AC-1 | TC-01 | `TC-01 …` | ✅ pass |

## Bugs
### BUG-1 {{Title}} — {{Critical | High | Medium | Low}}
- **Case:** TC-xx · **AC:** AC-x
- **Steps:** 1. … 2. …
- **Expected:** … **Actual:** …
- **Evidence:** `evidence/{{file}}.png`
- **Status:** {{open — test marked test.fail | fixed (--fix)}}

## Decisions needed
| # | Priority | Question | Default assumed in tests |
|---|----------|----------|--------------------------|

## Test fixes made during triage
- {{TC-xx: what was wrong with the test and how it was fixed}}

## Not covered
- {{What, and why (no browser, out of scope, needs credentials, …)}}
