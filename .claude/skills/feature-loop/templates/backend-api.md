<!-- template: spec-writer — backend-api -->
# backend-api — {{module}}/{{feature}}

## Routes
| Method | Path | Auth | Idempotency | Rate limit | Handler file |
|--------|------|------|-------------|------------|--------------|
| {{method}} | {{path}} | {{auth_scheme}} | {{idem_key_or_none}} | {{budget}} | {{path}} |

## DTOs
| Type | Source of truth | Consumed by | Validation |
|------|-----------------|-------------|------------|
| {{type_name}} | {{workspace}}/{{path}} | {{consumers}} | zod | joi | pydantic | class-validator |

## Error contracts
| HTTP | Code | Meaning | Body shape |
|------|------|---------|------------|
| 400 | {{code}} | {{meaning}} | `{ error: string, details?: … }` |
| 401 | | | |
| 403 | | | |
| 404 | | | |
| 409 | | | |
| 429 | | | |
| 500 | | | (generic — no exception text leaked; see security.md rule 41) |

## Rate limits
- Global: {{limit}}
- Per-user: {{limit}}
