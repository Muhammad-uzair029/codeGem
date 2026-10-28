<!-- template: spec-writer — registry helper -->
_This file is a row snippet for `.claude/specs/_index.md`. If `_index.md` does not exist, spec-writer creates it with this header first:_

```
# feature registry

Auto-maintained by feature-loop. Never hand-edit.

| module/feature | status | started | shipped | touches | shared contracts | one-liner |
|---|---|---|---|---|---|---|
```

_Then appends this row:_

```
| {{module}}/{{feature}} | {{status}} | {{start_date}} | {{shipped_date_or_dash}} | {{workspaces_csv}} | {{contracts_csv}} | {{one_liner}} |
```
