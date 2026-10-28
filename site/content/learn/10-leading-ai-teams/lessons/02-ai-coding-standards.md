---
title: AI coding standards and review practices
summary: Set clear rules for AI-assisted coding, review AI-written code for the mistakes it typically makes, and decide what every PR must include.
minutes: 12
practice: [lead-standards-1, lead-standards-2, lead-standards-3, lead-standards-4]
flow:
  title: An AI-assisted change, from task to merge
  steps:
    - label: Plan
      detail: The engineer understands the task and the relevant code first, and gives the AI tool clear context and constraints.
    - label: Generate
      detail: The AI tool drafts code or tests in small, reviewable steps rather than one huge change.
    - label: Author review
      detail: The engineer reads every line, runs it, and can explain it. They own the change, whoever typed it.
    - label: Automated checks
      detail: Lint, type checks, tests, dependency and secret scans run in CI, the same as for any code.
    - label: Pull request
      detail: The PR explains what changed and why, how it was tested, and which risky parts deserve attention.
    - label: Human review
      detail: A reviewer checks design, correctness, security and fit with the codebase, with extra care on areas where AI often slips.
    - label: Merge and learn
      detail: Recurring AI mistakes become rules in the team's guidelines or tool instruction files.
  loop:
    from: 7
    to: 1
    label: Guidelines improve future prompts
selfCheck:
  - q: Who is responsible for a bug in code an AI assistant wrote?
    options:
      - The AI vendor
      - The engineer who submitted it and, to a lesser degree, the reviewer who approved it
      - Nobody, it was generated
    answer: 1
    why: The author owns every line they submit. AI is a tool, like an IDE; it doesn't change accountability.
  - q: Which of these is a common failure in AI-written code that reviewers should check?
    options:
      - Code that is too short
      - Calls to functions, packages or options that don't exist, or subtly wrong edge-case handling
      - Too many comments explaining intent
    answer: 1
    why: Models can produce plausible-looking calls to non-existent APIs and code that passes the happy path but misses edge cases.
  - q: What is a sensible team rule for very large AI-generated PRs?
    options:
      - Approve them faster since the AI is consistent
      - Split them into small, reviewable changes the author can explain
      - Ban AI tools entirely
    answer: 1
    why: Review quality drops sharply with PR size. Small PRs keep humans able to actually check the code.
---

## Core concepts

AI coding assistants change **how code gets typed**, not **who is responsible for it**. The simplest rule a lead can set is: *you own every line you submit, whoever or whatever wrote it.* If you can't explain it, it isn't ready.

An analogy: AI tools are like a very fast, very confident junior pair programmer who has read a lot of code but has never seen your codebase or your users. Their drafts are useful and quick. They also sometimes invent things, miss context, and sound sure while being wrong. You wouldn't merge a junior's code without review; same here.

**What AI-written code typically gets wrong**

- **Hallucinated APIs**: functions, flags or packages that don't exist, or exist in a different version.
- **Plausible but wrong logic**: off-by-one errors, missing null checks, wrong time zone handling, swallowed errors.
- **Security gaps**: string-built SQL, missing authorisation checks, secrets in code, overly permissive CORS.
- **Ignoring local conventions**: a new helper that duplicates an existing one, a different error-handling style, new dependencies for something already solved.
- **Tests that test nothing**: tests written to match the implementation, mocking away the real behaviour, or asserting what the code does rather than what it should do.
- **Over-sized changes**: large diffs that touch far more than the task needs.

**What a lead's standards should cover**

1. **Allowed tools and data rules.** Which tools are approved, and what code or data may be sent to them (customer data, secrets, regulated code). This is a security and legal question; involve the right people.
2. **Ownership.** The author must understand, run and be able to explain every change.
3. **Size.** Small PRs. Large generated changes get split.
4. **Testing.** New behaviour needs meaningful tests; reviewers check that tests would fail if the code were wrong.
5. **Dependencies.** New packages need a reason and a check that they exist, are maintained, and are the intended package (attackers register look-alike names).
6. **Shared context.** Keep project instruction files for your AI tools (for example a `CLAUDE.md`, `AGENTS.md` or editor rules file) with conventions, commands and gotchas, so tools produce code that fits.

## How it works in real systems

**A PR template that works with AI-assisted code.** Don't make disclosure a guilt ritual. Make it useful context for the reviewer:

```markdown
## What and why
<!-- The problem and the approach, in your own words -->

## How I tested it
<!-- Commands run, cases covered, screenshots for UI -->

## Where to look closely
<!-- Tricky logic, security-sensitive parts, anything you're unsure of -->

## AI assistance
<!-- e.g. "Generated the parser and tests, I rewrote the error handling."
     Helps reviewers know where to focus. -->

- [ ] I have read and can explain every line
- [ ] No secrets, customer data or credentials in code or prompts
- [ ] New dependencies are justified and verified
```

**Automate what machines can check**, so human review time goes to design and correctness:

- Linting, formatting and type checks.
- Tests with coverage on changed lines (coverage measures what ran, not whether assertions are meaningful, so humans still check tests).
- Secret scanning and dependency vulnerability scanning.
- Static analysis for common security issues.

**A reviewer's checklist for AI-heavy diffs**

- Does every imported package and called API actually exist in our versions?
- Are edge cases handled: empty input, nulls, errors, concurrency, time zones?
- Are authorisation and input validation present where needed?
- Does it reuse existing helpers and follow our patterns?
- Would these tests fail if the code were broken?
- Is the change the smallest one that solves the task?

**Use AI in review too, carefully.** AI review tools can catch some issues quickly and are a good first pass. They are a supplement, not the approver: a human still signs off on design and risk.

> [!warning] Watch the review bottleneck
> When AI makes writing code faster, review becomes the bottleneck and reviewers start skimming. Track PR size and review time, and push back on huge diffs. Fast generation is worthless if nobody really reads the result.

## Common mistakes

- **Banning AI tools outright** → engineers use them anyway, without guidance; approve tools and set data rules instead.
- **No rules on what data goes into tools** → define what may be shared and use approved, appropriately configured tools.
- **"The AI wrote it" as an excuse** → make ownership explicit in the PR checklist and in reviews.
- **Rubber-stamping big generated PRs** → enforce small PRs and focused reviews.
- **Trusting generated tests** → check tests encode expected behaviour, and would fail on a bug.
- **Letting lessons evaporate** → add recurring AI mistakes to team guidelines and tool instruction files.

## Interview angle

Asked as "How should a team use AI coding tools?", "How do you review AI-generated code?" or "What would you put in a PR policy?"

A strong answer covers ownership, data and security rules, small PRs, meaningful tests, dependency checks, automated gates, a reviewer checklist targeting typical AI mistakes, and a feedback loop into team guidelines. It is balanced: pro-productivity, but not naive.

Follow-up interviewers like: **"A junior's PRs got much bigger and faster since they started using AI, and bugs went up. What do you do?"** Talk to them privately, agree on small PRs and self-review, pair on a review of one of their changes to show what to check, and track whether bug rates drop.
