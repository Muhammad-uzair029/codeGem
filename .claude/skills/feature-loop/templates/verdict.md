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
gaps:
  - section: {{spec_section}}
    expected: {{spec_line}}
    actual: {{code_behavior}}
    location: {{file_line}}
    severity: {{H_M_L}}
regression_risk:
  - existing_feature: {{feature}}
    risk: {{description}}
    evidence: {{file_line}}
    result: {{pass_or_fail}}
skill_verdicts:
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
files_touched_violation:
  - {{file_line}}
```

## Human summary

### Blockers (must fix in next iter)
- **[{{severity}}]** {{gap_description}} — at {{file_line}}.

### Follow-ups (non-blocking)
- {{item}}
