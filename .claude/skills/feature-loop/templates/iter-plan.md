<!-- template: implementer — iter plan -->
# iter-{{n}} plan — {{module}}/{{feature}}

**Iter:** {{n}}
**Trigger:** {{initial_or_gap_list}}
**Base SHA:** {{sha}}

## Per-file plan
| File | Change | Spec citation | Estimated LOC |
|------|--------|---------------|---------------|
| {{path}} | {{summary}} | {{spec_section_or_line}} | {{loc}} |

## Gaps addressed (iter > 1 only)
| Gap ID (from prior verdict) | File | Fix |
|-----------------------------|------|-----|
| {{gap_id}} | {{file}} | {{fix_summary}} |

## Regression safeguards
- Files touched (all inside allowlist): {{yes}}.
- Related-feature tests to re-run: {{list}}.
