<!-- template: spec-writer — security -->
# security — {{module}}/{{feature}}

## Applicable security-audit rules
_See project CLAUDE.md for the full 42-rule table. Only list rules the diff touches._

| Rule # | Rule | Expected verdict | Why it applies |
|--------|------|------------------|----------------|
| {{n}} | {{rule_summary}} | PASS | WARN accepted | {{reason}} |

## Threat model
| Threat | Vector | Mitigation | Test |
|--------|--------|-----------|------|
| {{threat}} | {{vector}} | {{mitigation}} | {{test_ref}} |

## PII inventory
| Field | Sensitivity | Storage | Retention | Log-redaction? |
|-------|-------------|---------|-----------|----------------|
| {{field}} | {{level}} | {{store}} | {{days}} | yes | no |

## Auth surface
- Endpoints introduced: {{count}}, all authenticated: {{yes_no}}.
- New roles / permissions: {{list}}.
