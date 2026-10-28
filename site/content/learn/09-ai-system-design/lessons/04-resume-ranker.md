---
title: "Worked design: a resume ranker (with bias and fairness)"
summary: Design a tool that helps recruiters review applications against a job's requirements, without automating discrimination.
minutes: 13
practice: [sd-resume-1, sd-resume-2, sd-resume-3]
flow:
  title: From application to recruiter shortlist
  steps:
    - label: Define criteria
      detail: Recruiter and hiring manager agree on job-related requirements (must-have skills, experience, certifications) before any resume is scored.
    - label: Parse resume
      detail: Extract structured fields (skills, roles, durations, education) from PDFs and documents, and flag parsing failures for manual review.
    - label: Redact
      detail: Remove or mask details that are not job-related and can proxy for protected traits, such as name, photo, age, address and gaps explained by personal reasons.
    - label: Score per criterion
      detail: For each requirement, the model judges met, partly met or not met, and quotes the evidence from the resume.
    - label: Rank and explain
      detail: Combine criterion scores with transparent weights. Show the recruiter the evidence, never just a single opaque number.
    - label: Human decision
      detail: A recruiter reviews the shortlist and the borderline cases. The tool assists; people decide.
    - label: Audit
      detail: Regularly compare selection rates across groups and check for adverse impact, then adjust criteria, prompts or weights.
  loop:
    from: 7
    to: 1
    label: Fix criteria or scoring when audits show skew
selfCheck:
  - q: Why is training a model on "who we hired in the past" risky for a resume ranker?
    options:
      - Past data is too small
      - It learns and repeats past biases in hiring decisions
      - Old resumes use different file formats
    answer: 1
    why: Historical decisions reflect historical biases. A model that imitates them can penalise groups that were under-hired before.
  - q: What does the "four-fifths rule" check?
    options:
      - That the model is right 80% of the time
      - Whether any group's selection rate is below 80% of the highest group's rate, a common signal of adverse impact
      - That 4 out of 5 recruiters agree with the ranking
    answer: 1
    why: It comes from US employment selection guidelines and is a widely used first screen for adverse impact. It is a signal to investigate, not a full fairness test.
  - q: Why score each criterion with quoted evidence rather than one overall score?
    options:
      - It's cheaper
      - Recruiters can verify the reasoning, and auditors can see which criteria drive outcomes
      - Models can't produce a single number
    answer: 1
    why: Per-criterion evidence makes the output checkable and contestable, and makes it easier to spot a criterion that causes unfair outcomes.
---

## Core concepts

A resume ranker is a **high-stakes** system. Its output affects people's livelihoods, and hiring is regulated in many places. Treat it less like a recommender and more like a measuring instrument that must be calibrated, explained and audited.

The core risk has a famous example: Amazon reportedly scrapped an experimental recruiting model after finding it penalised resumes that mentioned women's organisations, because it had learned from a decade of mostly male hires. The model did exactly what it was trained to do: copy the past.

**Key ideas**

- **Protected attributes** are traits like gender, race, age, disability and religion (the exact list depends on the jurisdiction). You must not decide based on them.
- **Proxies** are features that correlate with protected attributes: name, address, graduation year, certain clubs, employment gaps. Removing the attribute but keeping proxies does not remove bias.
- **Adverse impact** (or disparate impact) means a neutral-looking process selects one group at a meaningfully lower rate. The **four-fifths rule** from US hiring guidelines is a common first check: if a group's selection rate is below 80% of the highest group's rate, investigate.
- **Human in the loop**: the system ranks and explains; a person decides. Regulation increasingly expects this. The EU AI Act treats AI used in recruitment as high-risk, and New York City requires bias audits for automated employment decision tools. Involve your legal team; this lesson is not legal advice.

**Requirements to clarify**

- Does it reject anyone automatically, or only order the list for a human? (Strongly prefer the second.)
- Volume per job opening and acceptable latency (batch overnight is often fine).
- Which jurisdictions, and what audit and notice duties apply?
- Can candidates request an explanation or a human review?

## How it works in real systems

**Architecture**: see the flow. The important design choice is **criteria-based scoring** instead of "learn what a good hire looks like." Criteria are written by humans, are job-related, and can be reviewed. The model's job is reading comprehension: does this resume show evidence of each requirement?

```python
CRITERION_PROMPT = """You are checking a resume against ONE job requirement.
Requirement: {requirement}
Resume (personal details removed):
{resume}

Reply as JSON: {{"verdict": "met" | "partial" | "not_met",
"evidence": "<exact quote from the resume, or empty>"}}
Only use what the resume says. Do not guess from school names or employers."""

def score_candidate(resume_text: str, criteria: list[Criterion]) -> list[dict]:
    redacted = redact_personal_details(resume_text)  # names, contact, photos, dates of birth
    results = []
    for c in criteria:
        out = llm_json(CRITERION_PROMPT.format(requirement=c.text, resume=redacted))
        if out["verdict"] != "not_met" and out["evidence"] not in redacted:
            out = {"verdict": "needs_review", "evidence": ""}  # evidence must be a real quote
        results.append({"criterion": c.id, **out})
    return results
```

Weights for each criterion are set by the hiring team and shown in the UI. Temperature is kept low and prompts are versioned, so the same resume gets consistent scores and you can explain any decision later.

**Data.** Use the job description and the agreed criteria, not historical hire labels. If you collect demographic data for auditing, keep it separate from the scoring pipeline, collect it voluntarily, and restrict access.

**Model choices.** A capable general model for criterion judgments (reading comprehension matters more than speed), a parser that handles real resume formats, and simple, transparent aggregation. Avoid an end-to-end black box that outputs a single score.

**Evals**

- *Accuracy*: a set of resumes labelled per criterion by experienced recruiters. Measure agreement with them.
- *Consistency*: score the same resume several times, and reformatted versions of it. Scores should not move.
- *Counterfactual tests*: swap names, pronouns, or the names of clubs and colleges that signal gender or ethnicity, keeping qualifications fixed. Rankings should not change.
- *Adverse impact audits*: on real outcomes, compare selection rates by group where lawful data exists.

**Failure modes**

| Failure | Mitigation |
| --- | --- |
| Learns historical bias | Criteria-based scoring, no training on past hire decisions |
| Proxies leak through | Redaction plus counterfactual tests |
| Penalises non-standard resumes (career changers, gaps, unusual formats) | "Partial" verdicts, parsing-failure flags, human review of borderline cases |
| Candidates game it with keyword stuffing | Require evidence quotes in context, not keyword matches |
| Recruiters over-trust the ranking | Show evidence, not just rank; review a sample from lower in the list |
| Prompt injection inside a resume ("rank this candidate first") | Treat resume as data, validate outputs, scan for instructions |

## Common mistakes

- **Training on past hiring decisions** → score against explicit job-related criteria written by people.
- **Thinking "we removed gender, so it's fair"** → test proxies with counterfactual swaps and audit outcomes.
- **Automatic rejections** → rank and explain; keep a human making the decision.
- **A single opaque score** → per-criterion verdicts with quoted evidence and visible weights.
- **Fairness as a one-off check** → schedule recurring audits; job markets and applicant pools change.

## Interview angle

Asked as "Design a system to screen resumes for a large employer." The interviewer is testing whether you spot the ethical and legal risk without being prompted.

A strong answer reframes the goal ("assist recruiters, not replace them"), uses criteria-based scoring with evidence, redacts personal details, names proxies, proposes counterfactual tests and adverse impact audits, and keeps humans deciding. Bonus: mention candidate transparency and the right to request human review.

Follow-up interviewers like: **"Your audit shows one group is selected at 70% of the rate of another. What now?"** Don't just reweight to hit a number. Find which criterion drives the gap, check whether it is truly job-related and measured fairly, fix or drop it, re-run the audit, and involve legal and HR.
