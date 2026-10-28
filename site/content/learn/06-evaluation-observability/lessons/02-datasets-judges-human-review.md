---
title: Eval datasets, LLM-as-judge, and human review
summary: Build a dataset that looks like real traffic, use a model to grade at scale, and keep humans in the loop to check the grader.
minutes: 11
practice: [eval-judge-1, eval-judge-2, eval-judge-3, eval-judge-4]
flow:
  title: Building a trustworthy LLM judge
  steps:
    - label: Write a rubric
      detail: Turn "good" into specific, checkable criteria, ideally pass/fail per criterion.
    - label: Humans label a sample
      detail: Domain experts grade 50–100 outputs with the same rubric. This is your ground truth.
    - label: Run the judge
      detail: The judge model grades the same outputs, explaining its reasoning before its verdict.
    - label: Measure agreement
      detail: Compare judge and human labels; look closely at the disagreements.
    - label: Fix the judge
      detail: Tighten the rubric, add examples, or split criteria until agreement is acceptable.
    - label: Use at scale
      detail: Run the judge on the full dataset and production samples; spot-check with humans regularly.
  loop:
    from: 5
    to: 3
    label: Until judge agrees with humans
selfCheck:
  - q: An LLM judge prefers whichever answer is shown first in a pairwise comparison. What is this called?
    options:
      - Verbosity bias
      - Position bias
      - Self-preference bias
    answer: 1
    why: Position bias is a preference based on order. Mitigate by running both orders and only counting consistent verdicts.
  - q: What is the best source of eval examples?
    options:
      - Only examples the developer invents
      - Real user inputs (anonymized), plus hand-written edge cases
      - Public benchmark questions
    answer: 1
    why: Real traffic shows what users actually ask. Hand-written cases fill gaps for rare but important situations.
  - q: Why ask the judge for reasoning before the score?
    options:
      - It makes the output longer
      - It tends to make the verdict more grounded and gives you something to audit
      - It is required by the API
    answer: 1
    why: Explaining first usually improves consistency, and the explanation lets humans see why the judge decided.
---

## Core concepts

### Eval datasets

An eval dataset is a list of **examples**: an input, and either a reference output or criteria for judging the output. Good datasets:

- **Look like real traffic**: sample (and anonymize) production inputs. Developers' made-up questions are usually too clean.
- **Cover the categories**: common requests, edge cases, out-of-scope requests, adversarial inputs (prompt injection, jailbreak attempts).
- **Grow from failures**: every bug report or bad trace becomes a new example. This is how datasets get valuable.
- **Are versioned**: when you add cases, scores shift; record which dataset version a score came from.

Synthetic data (an LLM generating test questions) helps fill gaps, but review it; it tends to be repetitive and easier than real inputs.

### LLM-as-judge

Using a model to grade outputs. It scales to thousands of examples and can judge things code can't, like "is this answer polite and does it address the question?"

Two common forms:

- **Pointwise**: score one output against a rubric (pass/fail, or 1–5).
- **Pairwise**: given two outputs, which is better? Useful for comparing prompt or model versions.

Judges have known **biases**:

- **Position bias**: in pairwise comparisons, favoring the first (or second) option. Fix: evaluate both orders.
- **Verbosity bias**: favoring longer answers even when they aren't better. Fix: rubric says length isn't quality; penalize padding.
- **Self-preference**: models can favor outputs from their own model family. Fix: use a different model as judge, or calibrate against humans.
- **Weakness on hard checks**: judges can miss math errors, subtle factual errors, or code bugs. Fix: use code checks or references for those.
- **Vague scales drift**: "rate 1–10" is inconsistent. Fix: binary pass/fail per specific criterion is more reliable.

### Human review

Humans are the ground truth. Use them to: label a calibration set for the judge, review a sample of production outputs, and decide what "good" means in the first place. Domain experts beat generic annotators for specialized topics (legal, medical, finance).

## How it works in real systems

A pointwise judge with a specific, binary rubric and reasoning before the verdict:

```python
JUDGE_PROMPT = """You grade a support answer. Criteria:
1. ANSWERS_QUESTION: it directly addresses the user's question.
2. GROUNDED: every factual claim appears in the provided policy text.
3. NO_PROMISES: it does not promise refunds or dates the policy doesn't allow.

Policy:
{policy}

Question: {question}
Answer: {answer}

Think step by step about each criterion, then output JSON:
{{"reasoning": "...", "ANSWERS_QUESTION": true|false, "GROUNDED": true|false, "NO_PROMISES": true|false}}"""

def judge(question, answer, policy) -> dict:
    raw = call_model(JUDGE_MODEL, JUDGE_PROMPT.format(policy=policy, question=question, answer=answer),
                     temperature=0, response_format="json")
    return json.loads(raw)
```

Checking the judge against human labels is just a comparison:

```python
pairs = [(judge(**ex["inputs"])["GROUNDED"], ex["human_grounded"]) for ex in labeled_set]
agreement = sum(j == h for j, h in pairs) / len(pairs)
false_pass = sum(j and not h for j, h in pairs)   # judge said OK, human said bad: the dangerous kind
print(f"agreement={agreement:.0%}, false passes={false_pass}")
```

Practical tips:

- Set the judge's temperature to 0 and keep its prompt versioned like code.
- Separate criteria into separate scores so you know *what* failed.
- Track **false passes** specifically; a judge that lets bad answers through is worse than one that is too strict.
- Re-check agreement when you change the judge model or prompt.

## Common mistakes

- Dataset made only of easy, invented questions → sample real traffic and add hard edge cases.
- "Rate 1–10" with no rubric → specific, binary criteria with written definitions.
- Trusting a judge you never compared to humans → label a sample and measure agreement first.
- Pairwise comparisons in one order only → run both orders; count ties when they disagree.
- Using the same model to generate and to judge without checking for self-preference → use a different judge or calibrate.
- Labeling with non-experts for expert domains → involve people who actually know what correct looks like.

## Interview angle

Expected question: *"How would you use an LLM to evaluate another LLM, and what can go wrong?"* A strong answer covers rubric design (specific, binary criteria), reasoning before verdict, temperature 0, named biases (position, verbosity, self-preference) with mitigations, and **calibration against human labels** before trusting it. Mention using code checks wherever possible.

Follow-up: *"Your judge agrees with humans 95% of the time. Is it good enough?"* It depends on the errors: look at the disagreements. If the 5% are false passes on harmful answers, it isn't. Also check agreement per category, not only overall.
