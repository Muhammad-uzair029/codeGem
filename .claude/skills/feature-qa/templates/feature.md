# Feature: {{FEATURE_NAME}}

> Written by feature-qa on {{DATE}} from: {{SOURCES — spec path / PR / branch diff / description / code files}}

## Purpose
{{One or two sentences: who uses it and what it lets them do.}}

## Entry points
| Kind | Where |
|------|-------|
| {{URL / screen / endpoint / command}} | {{path, route, or selector}} |

## User flows
1. **{{Flow name}}** — {{step → step → outcome}}

## Business rules
- {{Rule}} {{(inferred) when not stated in a spec}}

## Inputs and limits
| Input | Valid | Invalid / edge |
|-------|-------|----------------|

## States
| State | When | What the user sees |
|-------|------|--------------------|
| Empty | | |
| Loading | | |
| Error | | |
| Success | | |

## Persistence and side effects
{{Storage keys, API writes, URLs/params, files — what survives a reload.}}

## Acceptance criteria
- **AC-1** {{Observable, testable statement.}}
- **AC-2** …

## Out of scope
- {{What this QA run will not cover, and why.}}
