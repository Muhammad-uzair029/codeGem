---
title: Mentoring engineers on AI tooling
summary: Help engineers at every level use AI tools well, without letting juniors skip the fundamentals or seniors dismiss useful tools.
minutes: 10
practice: [lead-mentor-1, lead-mentor-2, lead-mentor-3, lead-mentor-4]
selfCheck:
  - q: What's the main risk of juniors relying heavily on AI coding tools?
    options:
      - They type too fast
      - They ship code they don't understand and skip building debugging and design skills
      - AI tools don't work for juniors
    answer: 1
    why: Accepting code you can't explain blocks learning and hides bugs. Mentoring should make sure tools speed up learning rather than replace it.
  - q: A good way to teach effective AI tool use is...
    options:
      - Sending a link to the vendor docs
      - Pairing live on a real task and talking through how you give context, check output and decide what to keep
      - Banning tools until engineers are senior
    answer: 1
    why: The skill is mostly judgment, which is best learned by watching and practising on real work.
  - q: How should you handle a senior engineer who refuses to try AI tools?
    options:
      - Mandate usage metrics
      - Understand their concerns, invite them to test tools on a task they choose, and use their scepticism to improve team standards
      - Ignore it
    answer: 1
    why: Sceptical seniors often have valid concerns about quality and security. Engaging them makes the team's practices better.
---

## Core concepts

AI tools amplify whatever skill is already there. A strong engineer with good judgment gets faster. An engineer who can't yet judge code quality gets faster at producing code they can't evaluate. Mentoring is about building the **judgment**, not just the tool habits.

Think of it like a calculator in maths class. It's a huge help once you understand the maths. If you never learn the maths, you can't tell when you typed the wrong number and got a nonsense answer.

**What "good at AI tools" actually means**

- **Giving context**: pointing the tool at the right files, explaining constraints, conventions and the goal.
- **Breaking work down**: asking for small steps instead of a whole feature at once.
- **Verifying**: reading output critically, running it, testing edge cases, checking that APIs exist.
- **Knowing when not to use it**: unfamiliar security-critical code, or when the fastest path to understanding is to write it yourself.
- **Data hygiene**: not pasting secrets or customer data into tools that aren't approved for it.

**Different levels need different coaching**

- **Juniors**: protect the fundamentals. Encourage using AI to *explain* code and errors, not only to write it. Require them to explain any generated code in review.
- **Mid-level**: focus on workflow (planning, context, test-first prompting) and spotting subtle bugs.
- **Seniors**: invite them to shape standards, build shared prompts and instruction files, and evaluate new tools. Their scepticism is valuable.

## How it works in real systems

**Practical mentoring habits**

- **Live pairing on real tasks.** Show your actual workflow: how you describe the task, what context you give, how you reject a bad suggestion, and why. Narrate your judgment out loud.
- **"Explain it back" in reviews.** Ask "walk me through this function" on AI-heavy PRs. Not as a trap; as a habit that builds understanding.
- **Deliberate practice without tools.** Occasionally ask juniors to debug or design without AI first, then compare with what the tool suggests.
- **Shared playbooks.** A team page with prompts and workflows that worked, known pitfalls, and the project instruction files your tools read.
- **Demo sessions.** Short, regular sessions where someone shows a workflow that saved time, or a failure that cost time. Failures teach as much as wins.

**Measure outcomes, not usage.** Tracking "percentage of code written by AI" or tool logins encourages the wrong behaviour. Look at what matters: cycle time, review rework, defect rates, incidents, and how confident engineers feel working in unfamiliar parts of the codebase.

**A simple growth path you can share with the team**

1. *Explain*: use AI to understand code, errors and concepts.
2. *Assist*: generate small pieces you fully review (tests, boilerplate, refactors).
3. *Drive*: plan multi-step changes with the tool, verify each step, and keep changes small.
4. *Multiply*: improve team instructions, prompts and standards so everyone benefits.

> [!note] Keep up without chasing everything
> Tools change quickly. Set a light process: one person evaluates a new tool on a real task each month, writes a short note on what worked, and the team adopts only what clearly helps. Avoid switching tools every week.

## Common mistakes

- **Assuming people will figure it out** → pair, demo and share playbooks; judgment is learned from examples.
- **Letting juniors skip fundamentals** → require them to explain generated code and practise debugging without tools.
- **Measuring AI usage instead of outcomes** → track quality and delivery metrics, not lines generated.
- **Dismissing sceptics** → engage them in evaluating tools and setting standards.
- **One-size-fits-all training** → tailor coaching to the engineer's level and goals.
- **Hiding failures** → share AI-caused bugs openly and turn them into guidelines, without blame.

## Interview angle

Asked as "How do you help your team adopt AI tools?", "How do you mentor juniors when AI writes much of the code?" or "Tell me about a time you coached someone on a new tool."

A strong answer distinguishes coaching by level, protects fundamentals for juniors, uses pairing and reviews as the main teaching tools, measures outcomes rather than usage, and engages sceptics. In behavioural form, use STAR with a specific person, what you did, and a measurable result.

Follow-up interviewers like: **"How do you know your AI adoption effort is working?"** Look at delivery and quality metrics before and after, review rework and defects, and ask engineers directly in one-to-ones and surveys.
