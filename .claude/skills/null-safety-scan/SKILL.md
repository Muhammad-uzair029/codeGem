---
name: null-safety-scan
description: Strict null/undefined/None safety audit on staged TS/JS/Python files. Flags unguarded property access, missing optional chaining, unchecked function returns, unsafe array/dict access, and missing default values. Use when the user types "null-safety-scan", "/null-safety-scan", "check null safety", "audit nullables", or before merging risky logic.
---

## Objective
Catch the class of bugs that ship to production and crash on edge data: `cannot read property 'x' of undefined`, `NoneType has no attribute`, off-by-one nulls. Run a focused pass over staged files only.

## Hard Rules
- **Scan staged files only** — not the whole repo. Use `git diff --cached --name-only` to scope.
- **Report, don't auto-fix.** Surface findings with file:line; let the developer choose the remediation. Null-handling has semantic implications.
- **Distinguish severity.** Critical = will crash. Warning = could crash on edge data. Info = stylistic / could be safer.

## What to look for

### TypeScript / JavaScript
1. **Unguarded property chains** — `obj.a.b.c` where any link could be `null`/`undefined`. Suggest `?.`.
2. **Array access without bounds** — `arr[i].method()` without length check or `?.`.
3. **`.find` / `.match` results used directly** — these return `undefined` / `null`. Must guard.
4. **`JSON.parse` results used directly** — return is `any`, treat as untrusted.
5. **API response usage** — `const data = await res.json(); data.field.x` — no shape validation.
6. **`as Type` casts** — bypassing the type checker. Flag every one.
7. **Non-null assertion `!`** — flag every use; require justification.
8. **`Number(x)` / `parseInt(x)`** — can return `NaN`. Flag if result feeds arithmetic without check.
9. **Async without `try/catch`** — unhandled rejection on awaited calls in non-trivial flows.
10. **Optional chaining without nullish coalescing** — `a?.b` used as a value where `undefined` propagates silently. Suggest `?? defaultValue`.

### Python
1. **`dict[key]` instead of `dict.get(key)`** — when key may be absent. Suggest `.get(key, default)`.
2. **`list[i]` without bounds check** — `IndexError` risk.
3. **`None` returned from typed functions** — caller does `result.x` without `if result is None`.
4. **`re.search` / `re.match` results** — return `Optional[Match]`. Direct `.group()` will crash on no-match.
5. **`os.environ["KEY"]`** — raises `KeyError`. Suggest `.get("KEY", default)`.
6. **`json.loads` returns** — untrusted shape; flag direct attribute access.
7. **`*= None` / `Optional[T]`** — used in arithmetic or chained without guard.
8. **`try/except` without specific exception** — bare `except:` swallows everything, including null-related errors.
9. **`response.json()["field"]`** — chained API access without `.get` / try.

## Execution Steps

### 1. Gather staged files
```bash
git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx|js|jsx|mjs|cjs|py)$'
```
If empty, stop: "No staged JS/TS/Python files to scan."

### 2. Scan each file
For each file, run `git diff --cached <file>` to get the changed hunks. Focus on **added/modified lines only** — don't lecture about pre-existing nulls outside the diff scope.

For each finding, capture:
- File path + line number (use `+` line numbers from the diff)
- Severity: `CRITICAL` / `WARNING` / `INFO`
- Pattern matched
- Suggested fix (one line)

### 3. Output format
```
null-safety scan — N findings across M files

CRITICAL — src/payment/refund.ts:42
  customer.address.city accessed without guard; customer.address can be null
  → use customer.address?.city ?? "unknown"

WARNING — src/api/handler.ts:88
  await res.json() result used as { user: {...} } without validation
  → validate shape with zod / yup before use

INFO — services/email.py:17
  os.environ["SMTP_HOST"] will raise KeyError if missing
  → os.environ.get("SMTP_HOST", "localhost")
```

Group by severity. Critical first. If clean — print "No null-safety issues found in staged changes."

### 4. Exit code
- 0 if no CRITICAL findings
- 1 if any CRITICAL findings

WARNING and INFO never block — they're advisory.

## Output Style
Findings stay normal prose for readability. Status messages from the skill match active session tone.
