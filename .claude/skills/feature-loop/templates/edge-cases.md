<!-- template: brainstormer output — edge-cases -->
# edge-cases — {{module}}/{{feature}}

Every row filled. `N/A` requires a cited reason.

## 1. Input validation
| Case | Trigger | Expected behavior | Test hook | Source |
|------|---------|-------------------|-----------|--------|
| empty | {{trigger}} | {{expected}} | {{test_ref}} | {{spec_ref}} |
| null | | | | |
| oversized | | | | |
| malformed | | | | |
| wrong-type | | | | |
| injection | | | | |
| unicode | | | | |
| RTL | | | | |
| whitespace | | | | |
| decimal edge | | | | |

## 2. Auth / authz
| Case | Trigger | Expected behavior | Test hook | Source |
|------|---------|-------------------|-----------|--------|
| unauth | | | | |
| expired session | | | | |
| insufficient role | | | | |
| cross-tenant access | | | | |
| role escalation | | | | |
| disabled account | | | | |

## 3. Concurrency
| Case | Trigger | Expected behavior | Test hook | Source |
|------|---------|-------------------|-----------|--------|
| race | | | | |
| double-submit | | | | |
| lock timeout | | | | |
| deadlock | | | | |
| out-of-order events | | | | |
| replay | | | | |

## 4. Failure modes
| Case | Trigger | Expected behavior | Test hook | Source |
|------|---------|-------------------|-----------|--------|
| network drop | | | | |
| downstream 5xx | | | | |
| downstream timeout | | | | |
| partial write | | | | |
| retry storm | | | | |
| circuit-break | | | | |

## 5. Data lifecycle
| Case | Trigger | Expected behavior | Test hook | Source |
|------|---------|-------------------|-----------|--------|
| create-existing | | | | |
| read-missing | | | | |
| update-stale | | | | |
| delete-referenced | | | | |
| restore | | | | |
| migrate mid-flight | | | | |

## 6. State transitions
| Case | Trigger | Expected behavior | Test hook | Source |
|------|---------|-------------------|-----------|--------|
| illegal transition | | | | |
| replay | | | | |
| idempotency key | | | | |
| resume-after-crash | | | | |

## 7. Boundary
| Case | Trigger | Expected behavior | Test hook | Source |
|------|---------|-------------------|-----------|--------|
| empty list | | | | |
| max size | | | | |
| unicode name | | | | |
| timezone | | | | |
| DST | | | | |
| leap day | | | | |
| currency rounding | | | | |
| pagination end | | | | |

## 8. Platform
| Case | Trigger | Expected behavior | Test hook | Source |
|------|---------|-------------------|-----------|--------|
| mobile offline | | | | |
| background/foreground | | | | |
| low-battery | | | | |
| cold start | | | | |
| a11y (screen reader, contrast) | | | | |
| i18n | | | | |
| RTL | | | | |

## 9. Rollout
| Case | Trigger | Expected behavior | Test hook | Source |
|------|---------|-------------------|-----------|--------|
| flag off | | | | |
| mid-rollout | | | | |
| kill-switch fired | | | | |
| backward compat (old client, new server) | | | | |
| forward compat (new client, old server) | | | | |
