<!-- template: verifier — verdict -->
# iter-{{n}} verdict — {{module}}/{{feature}}

**Verdict:** {{ship_or_block}}
**Iter:** {{n}}
**Head SHA:** {{sha}}

## Structured verdict (parsed by orchestrator)

```yaml
verdict: {{ship_or_block}}
iter: {{n}}
head_sha: {{sha}}
gate: {{PASS_FAIL_or_INCOMPLETE}} ({{gate_summary_path}})
uncovered: [{{gate_SKIP_lines_or_empty}}]
gaps:
  - section: {{spec_section}}
    expected: {{spec_line}}
    actual: {{code_behavior}}
    location: {{file_line}}
    severity: {{H_M_L}}
    source: {{check_name}}
regression_risk:
  - existing_feature: {{feature}}
    risk: {{description}}
    evidence: {{file_line}}
    result: {{pass_or_fail}}
skill_verdicts:            # one line per applicable check: verdict | error | skipped (reason); reused ones marked (iter K)
  feature-review: {{verdict}}
  security-audit: {{verdict}}
  contract-drift-check: {{verdict}}
  api-mock-parity: {{verdict}}
  complexity-check: {{verdict}}
  null-safety-scan: {{verdict}}
  test-coverage-delta: {{verdict}}
  dead-code-scan: {{verdict}}
  perf-budget: {{verdict}}
  migration-safety: {{verdict}}
  dependency-hygiene: {{verdict}}
  feature-qa: {{verdict}}
  second-opinion: {{verdict}}
files_touched_violation:
  - {{file}}
```

## Human summary

### Blockers (must fix in next iter)
- **[{{severity}}]** {{gap_description}} — at {{file_line}}.

### Follow-ups (non-blocking)
- {{item}}
