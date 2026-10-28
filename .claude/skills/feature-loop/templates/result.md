<!-- template: result-writer — ship record -->
# result — {{module}}/{{feature}}

**Verdict:** {{ship_or_escalate}}
**Iters:** {{n}}
**Base → Head:** {{base_sha}} → {{head_sha}}
**Files touched:** {{count}} · {{loc}} LOC
**Shipped:** {{date}}
**Author(s):** {{authors}}

## Executive summary
{{three_sentences}}

## Spec ↔ implementation mapping
| Spec section | Files | Verified by |
|--------------|-------|-------------|
| Acceptance criterion 1 | {{files}} | {{verifier_row}} |

## Related-feature impact
| Related feature | Regression risk | Result |
|-----------------|-----------------|--------|
| {{feature}} | {{risk}} | pass \| fail |

## Sub-skill rollup (final iter)
| Sub-skill | Verdict | Top finding |
|-----------|---------|-------------|
| feature-review | {{verdict}} | {{finding}} |
| security-audit | {{verdict}} | {{finding}} |
| contract-drift-check | {{verdict}} | {{finding}} |
| api-mock-parity | {{verdict}} | {{finding}} |
| complexity-check | {{verdict}} | {{finding}} |
| null-safety-scan | {{verdict}} | {{finding}} |
| test-coverage-delta | {{verdict}} | {{finding}} |
| dead-code-scan | {{verdict}} | {{finding}} |
| perf-budget | {{verdict}} | {{finding}} |
| migration-safety | {{verdict}} | {{finding}} |
| dependency-hygiene | {{verdict}} | {{finding}} |

## Residual blockers (ESCALATE only — omit on clean ship)
- **[{{severity}}]** {{gap}} — at {{file_line}}.

## Follow-ups (non-blocking, ticketable)
- {{item}}
