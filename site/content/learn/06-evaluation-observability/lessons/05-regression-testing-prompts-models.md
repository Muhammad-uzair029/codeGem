---
title: Regression testing when prompts or models change
summary: Every prompt edit or model upgrade is a code change; run it against a fixed dataset, compare with the baseline, and gate the release.
minutes: 10
practice: [eval-regress-1, eval-regress-2, eval-regress-3]
flow:
  title: A regression gate in CI
  steps:
    - label: Change proposed
      detail: A pull request edits a prompt, swaps the model, changes retrieval settings, or updates a tool.
    - label: Run eval suite
      detail: CI runs the app over a fixed, versioned dataset with the same evaluators used for the baseline.
    - label: Compare to baseline
      detail: Scores are compared to the current production version, overall and per category.
    - label: Gate
      detail: Fail if any key metric drops beyond a tolerance, or if any must-pass case fails.
    - label: Review diffs
      detail: A human reads the examples that changed from pass to fail (and fail to pass).
    - label: Staged rollout
      detail: Ship to a small share of traffic (canary or A/B), watch online metrics, then roll out fully.
selfCheck:
  - q: Why pin a specific model version (snapshot) in production instead of an alias that points to "latest"?
    options:
      - Pinned versions are always cheaper
      - So model behavior doesn't change underneath you without going through your eval gate
      - Aliases don't support tool calling
    answer: 1
    why: An alias can be moved to a new model by the provider. Pinning means upgrades happen when you choose, after evals.
  - q: Overall score went from 88% to 89%, but the "refund questions" category fell from 95% to 70%. Should you ship?
    options:
      - Yes, the overall score improved
      - Not without investigating; per-category regressions can hide inside a stable average
      - Yes, as long as latency improved
    answer: 1
    why: Averages hide regressions in important slices. Gate on key categories and must-pass cases, not just the total.
---

## Core concepts

In LLM apps, **prompts, model versions, retrieval settings, and tool definitions are all code**. Changing any of them can break behavior that used to work, often in places you didn't touch. A **regression test** for an LLM app re-runs a fixed eval dataset after a change and compares the results to the previous version, the **baseline**.

Analogy: a restaurant changes a supplier. The head chef re-tastes the full menu, not just the dish that prompted the change, because the new butter affects every sauce.

What triggers a regression run:

- Editing a system prompt or few-shot examples.
- Switching or upgrading the model (including the provider retiring an old version).
- Changing chunking, embeddings, top-k, or the reranker.
- Adding, renaming, or rewording tools.
- Upgrading a framework or SDK.

Key ideas:

- **Golden dataset**: a curated, versioned set of examples with references or criteria, kept stable so scores are comparable over time.
- **Must-pass cases**: a small set that must never fail (safety refusals, legal disclaimers, critical workflows). Any failure blocks.
- **Tolerances**: because outputs vary, small score changes may be noise. Set thresholds (e.g. "faithfulness may not drop more than 2 points") and run important cases more than once.
- **Slices**: report per category (billing, technical, multilingual) so a drop in one area isn't hidden by gains elsewhere.
- **Pin models**: use dated or versioned model identifiers in production, not "latest" aliases, so upgrades go through the gate.

## How it works in real systems

A CI gate that compares a candidate run with a stored baseline. Plain pytest, no special framework:

```python
import json, pytest

BASELINE = json.load(open("evals/baseline_scores.json"))   # from the production version
TOLERANCE = 0.02                                            # allowed drop per metric

@pytest.fixture(scope="session")
def candidate():
    return run_eval_suite(dataset="evals/golden_v7.jsonl")  # returns {"slices": ..., "must_pass": [...]}

def test_must_pass_cases(candidate):
    failed = [c["id"] for c in candidate["must_pass"] if not c["passed"]]
    assert not failed, f"must-pass cases failed: {failed}"

@pytest.mark.parametrize("slice_name", list(BASELINE["slices"]))
def test_no_slice_regression(candidate, slice_name):
    for metric, base in BASELINE["slices"][slice_name].items():
        new = candidate["slices"][slice_name][metric]
        assert new >= base - TOLERANCE, f"{slice_name}.{metric}: {base:.2f} -> {new:.2f}"
```

How mature teams run it:

- **Fast suite on every PR** (a few dozen cases, code checks plus a cheap judge) and a **full suite nightly** or before release.
- **Side-by-side diff review**: tools such as LangSmith show experiments next to each other, so a human can read exactly which answers changed.
- **Model upgrades are projects**: run the full suite on the new model, expect to re-tune prompts, compare cost and latency too, and keep the old version pinned until the new one wins.
- **After the offline gate, roll out gradually**: canary or A/B on a share of traffic, with online evaluators and user feedback compared between versions.
- **Update the baseline deliberately** when you ship, and record which prompt, model, and dataset version produced it.

> [!tip] Version everything together
> Store the prompt, model id, retrieval settings, and dataset version alongside each eval result. "Score was 0.91" is useless if you can't say what produced it.

## Common mistakes

- Testing only the case you were fixing → re-run the whole dataset; regressions appear elsewhere.
- Using "latest" model aliases in production → pin versions and upgrade through the eval gate.
- Gating on the overall average → gate per slice and on must-pass cases.
- Treating a 1-point change on 40 examples as real → set tolerances, repeat runs, and grow the dataset.
- Changing the dataset and the prompt in the same comparison → keep the dataset fixed while comparing app versions.
- Skipping online monitoring because offline evals passed → canary the change and watch real traffic.

## Interview angle

Asked as: *"We want to switch to a newer, cheaper model. How do you make that decision safely?"* A strong answer: run the full golden dataset on both models with the same evaluators; compare quality per slice, must-pass cases, latency, and cost; read the changed examples; adjust prompts if needed; then canary in production with online metrics before full rollout; keep the old model pinned for rollback.

Follow-up: *"How do you deal with non-determinism in regression tests?"* Use low temperature where it fits, run key cases several times and look at pass rates, set tolerances based on observed run-to-run variance, and make must-pass checks code-based where possible.
