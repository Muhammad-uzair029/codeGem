<!-- template: spec-writer — tests -->
# tests — {{module}}/{{feature}}

Every acceptance criterion has ≥ 1 row. Every filled edge case has ≥ 1 row.

## Test matrix
| ID | Source (criterion / edge case) | Layer | File | Case name |
|----|-------------------------------|-------|------|-----------|
| T-01 | acceptance #1 | unit | {{file}} | {{name}} |
| T-02 | acceptance #2 | integration | {{file}} | {{name}} |
| T-03 | edge-cases §1.injection | unit | {{file}} | {{name}} |
| T-04 | edge-cases §3.race | integration | {{file}} | {{name}} |
| T-05 | user-journey 1 happy | e2e | {{file}} | {{name}} |
| T-06 | user-journey 1 failure | e2e | {{file}} | {{name}} |

## Coverage target
New lines: 100% covered by the matrix above. Verifier uses `test-coverage-delta` to enforce.
