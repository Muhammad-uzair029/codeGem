---
title: Explaining AI limits to clients and stakeholders
summary: Set honest expectations about accuracy, cost and risk in plain language, and turn "can AI do this?" into a decision people can make.
minutes: 10
practice: [lead-limits-1, lead-limits-2, lead-limits-3, lead-limits-4]
selfCheck:
  - q: A client asks for "100% accurate" AI answers. What's the best response?
    options:
      - Promise it, then improve later
      - Explain that some errors will happen, show the measured error rate and how the design catches or limits errors
      - Refuse the project
    answer: 1
    why: Honesty plus a plan builds trust. Talk about how often it is wrong, how mistakes are caught, and what they cost.
  - q: Which framing usually helps non-technical stakeholders most?
    options:
      - How transformers and attention work
      - What it gets right, how often it is wrong, what happens when it is wrong, and what it costs
      - The names of the models used
    answer: 1
    why: Decision-makers need outcomes, risks and costs, not internals.
  - q: Why show stakeholders failure examples, not just successes?
    options:
      - To lower their expectations so they're easy to beat
      - So they understand the real behaviour and can make informed decisions about risk and human review
      - Because demos are not allowed
    answer: 1
    why: Seeing real failures makes the error rate concrete and helps them decide where human checks are needed.
---

## Core concepts

Most stakeholders meet AI through impressive demos and headlines. Your job as a lead is to be the honest translator: neither a hype machine nor a wet blanket. The goal is a **good decision**, not winning the conversation.

A useful analogy for clients: an AI model is like a **very fast, well-read intern**. It drafts quickly and knows a bit about everything. It also sometimes makes things up with total confidence, doesn't know your business unless you tell it, and needs its work checked where mistakes are costly. Most people instantly understand what an intern should and shouldn't be trusted with.

**The limits worth explaining, in plain words**

- **It will sometimes be wrong**, and it can sound sure while wrong ("hallucination": confident, made-up output).
- **It's not deterministic.** The same question can get slightly different answers.
- **It only knows what it was trained on or what we give it.** Your internal data has to be connected deliberately, and its general knowledge stops at a training cutoff.
- **Quality is a percentage, not a yes/no.** "It works" means "it passes most of our test cases," and we can show which ones fail.
- **Costs scale with usage.** More users and longer inputs mean a bigger bill, unlike a fixed licence.
- **Risks are real**: privacy, prompt injection, bias, and regulatory duties in some domains.

**Turn "Can AI do X?" into four questions**

1. How often does it get X right on *your* data? (Measure; don't guess.)
2. What happens when it's wrong, and who catches it?
3. What does it cost per use, and at your expected volume?
4. What's the alternative, and how does AI compare?

## How it works in real systems

**Show, don't promise.** Before committing to a client, run a short evaluation on their real examples and present results as a simple table:

| Case type | Share of cases | Correct | Typical failure |
| --- | --- | --- | --- |
| Simple order questions | 60% | Almost all | Rare formatting issues |
| Multi-order questions | 25% | Most | Mixes up orders |
| Complaints and edge cases | 15% | About half | Misses tone, wrong policy |

(The numbers above are illustrative; use your own measured results.)

Then propose a design that fits the numbers: automate the first row, AI-draft plus human review for the second, route the third to people.

**Words that set expectations well**

- Instead of "the AI understands your documents," say "it finds relevant passages and summarises them; it can miss or misread things, so answers link to sources."
- Instead of "it's accurate," say "on 200 of your real cases, it got 170 right; here are the 30 it got wrong and what we're doing about them."
- Instead of "we'll fix hallucinations," say "we reduce them with grounding and checks, and design so a wrong answer is caught before it causes harm."

**Handling pushback**

- *"Competitor X says their AI is perfect."* Ask what they measured and on what data. Offer to evaluate both on the client's own cases.
- *"Just make it smarter."* Explain the levers (better data, retrieval, a stronger model, human review) and what each costs in time and money.
- *"Why can't you guarantee it?"* Compare with any human process: people make mistakes too; the question is the error rate, how errors are caught, and the cost of each.

> [!tip] Write the limits into the plan
> Put expected accuracy, known failure types, human review points and cost assumptions in the proposal or project brief. Expectations that are written down survive the next exciting demo.

## Common mistakes

- **Overpromising to win the deal** → promise a process (evaluate, pilot, measure), not a number you haven't measured.
- **Drowning people in internals** → talk outcomes, risks and costs; keep architecture for those who want it.
- **Showing only best-case demos** → show a balanced sample, including failures.
- **Saying "it depends" and stopping** → say what it depends on and offer a quick way to find out.
- **Ignoring cost until the invoice** → present cost per use and at projected volume early.
- **Being so cautious nobody ships** → pair each limit with a mitigation and a path forward.

## Interview angle

Asked as "How do you explain AI limitations to a non-technical client?", "Tell me about a time you pushed back on unrealistic expectations," or "A client wants AI to fully replace their review team. What do you say?"

A strong answer uses plain language and a relatable analogy, grounds the discussion in measured results on the client's data, proposes a design that matches the risk (human review where errors are costly), and documents expectations. In behavioural form, use STAR (Situation, Task, Action, Result) and show the business outcome.

Follow-up interviewers like: **"What do you do if the client insists on launching without human review?"** Explain the risk with concrete failure examples and costs, propose a limited rollout with monitoring and a rollback trigger, document the decision and who owns the risk, and escalate if it crosses legal or safety lines.
