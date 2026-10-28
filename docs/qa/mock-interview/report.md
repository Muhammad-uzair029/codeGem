# QA report: Mock interview (Interview prep, mock mode)

**Verdict: PASS WITH ISSUES** — all 21 P0/P1 cases pass; one P2 accessibility bug is open (the overall score is hidden from assistive tech) and three decisions are open.

| Run | Value |
|-----|-------|
| Date | 2026-10-28 |
| Build / commit | `6a28b86` on `main`; site built with `npm run build` (Node 22.22.3), 166 questions |
| Browsers / viewports | Google Chrome (`channel: 'chrome'`) at 1440×900, 375×812 (TC-24), light and dark themes (TC-25) |
| Cases | 29 cases → 30 tests (TC-25 runs once per theme): 8 P0 · 13 P1 · 8 P2 |
| Result | 29 passed · 1 known bug (`test.fail`) · 0 flaky (90/90 as expected after `--repeat-each=3`) |
| Re-run | `cd site && npm run build && cd .. && npx playwright test --project=qa --repeat-each=3` |

Evidence: `evidence/results.json` (3× run), `evidence/html-report/index.html`, screenshots `evidence/*.png`.

## Traceability
| AC | Case | Result |
|----|------|--------|
| AC-1 | TC-01 Deep link opens mock setup with defaults · TC-02 Clicking the tab opens setup and sets the URL | ✅ pass |
| AC-2 | TC-03 No topic selected disables Start · TC-04 Pool smaller than count gives all of them · TC-05 Empty pool disables Start | ✅ pass |
| AC-3 | TC-06 5-question mock from chosen topic and level · TC-07 15 distinct questions with mixed types · TC-08 Double-submitting Start doesn't start twice | ✅ pass |
| AC-4 | TC-09 Next gated on answering MCQ and open questions · TC-10 Skip advances; last question shows finish labels | ✅ pass |
| AC-5 | TC-11 No correctness feedback during the mock | ✅ pass |
| AC-6 | TC-12 Score (63%), verdict and tallies · TC-13 All-skipped run scores 0% | ✅ pass |
| AC-7 | TC-14 End interview: Cancel keeps, OK ends · TC-15 No prompt when everything is answered | ✅ pass |
| AC-8 | TC-16 Timer counts down and goes low under 2 minutes · TC-17 Time-up opens results | ✅ pass |
| AC-9 | TC-18 Finishing updates stats and Review later · TC-19 Perfect run has nothing to review | ✅ pass |
| AC-10 | TC-20 Start another mock keeps the previous configuration | ✅ pass |
| AC-11 | TC-21 Module deep link pre-selects only that topic | ✅ pass |
| AC-12 | TC-22 Keyboard-only mock run | ✅ pass |
| AC-12 | TC-23 Overall score is exposed to assistive technology | ❌ known bug (BUG-1) |
| AC-13 | TC-24 No horizontal scroll at 375px · TC-25 1440px light and dark | ✅ pass |
| AC-14 | TC-26 Blocked localStorage · TC-27 questions.json 500 · console guard on every test | ✅ pass |
| state | TC-28 Switching tabs mid-mock keeps progress · TC-29 Reload mid-mock returns to setup | ✅ pass |

## Bugs
### BUG-1 Screen readers can't reach the overall mock score — Low
- **Case:** TC-23 · **AC:** AC-12
- **Steps:** 1. Open `/interview/?mode=mock`. 2. Run a two-module mock with one MCQ right and one wrong. 3. Inspect the accessibility tree of `section.sum`.
- **Expected:** "50%" is readable by assistive tech. **Actual:** `div.sum-score` has `aria-hidden="true"` (`site/src/scripts/interview.js`, `finishMock`) and nothing else states the overall percentage.
- **Evidence:** `evidence/TC-23-results-score-aria-hidden.png`, `evidence/html-report`.
- **Suggested fix:** remove `aria-hidden`, or add visually hidden text such as "Overall score 50%".
- **Status:** open — test marked `test.fail`.

## Decisions needed
| # | Priority | Question | Default assumed in tests |
|---|----------|----------|--------------------------|
| 1 | Medium | Should a reload during a mock resume progress? Today it's lost silently, with no `beforeunload` warning. | Losing it is acceptable; TC-29 asserts a clean return to setup. |
| 2 | Low | When `questions.json` fails, `?mode=mock` shows the error card in the Practice tab and the tabs are inert. Should the Mock tab show its own error? | Enough as is; TC-27 checks the error is visible and no working Start button is offered. |
| 3 | Medium | Skipped and unanswered questions are recorded with score 0, so they count as "Answered" and lower Accuracy. Intended? | Yes; TC-18 asserts Answered = 5 and Accuracy = 0% after 5 skips. |

## Test fixes made during triage
- TC-23 first asserted "0%" after an all-skip run and passed by accident, because a per-module row also read "0%". Rebuilt as a two-module 50% run; the bug reproduces.
- `playwright.config.ts`: added a `qa` project. The spec serves `site/dist` from a worker-scoped Node HTTP fixture, because a global `webServer` would also start for the Electron projects.

## Not covered
- Browsers other than Chrome, and touch/mobile emulation (no bundled browsers).
- Overlap of the sticky `.mock-bar` with the site header at 375px — full-page screenshots misplace sticky elements; needs a viewport check.
- The 45-minute timer beyond a layout check (logic shared with the 20-minute timer, covered by TC-16/17).
- Real screen-reader output (only the accessibility tree was checked).
- Correctness of question content and answer keys.
