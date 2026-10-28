# Feature: Mock interview (Interview prep, mock mode)

> Written by feature-qa on 2026-10-28 from: code only (no feature-loop spec, no PR/branch diff). Files: `site/src/pages/interview/index.astro`, `site/src/scripts/interview.js` (mock section + `questionCard` in mock mode), `site/src/scripts/learn-store.js`, `site/src/pages/interview/questions.json.js`, `site/src/lib/learn.js#getQuestions`, `site/src/styles/learn.css` (`.mock-*`, `.sum-*`). Built data at the time of the run: 166 questions (82 MCQ · 58 open · 26 design) across 10 modules.

## Purpose
Lets someone preparing for an AI-engineering interview run a timed (or untimed) set of mixed questions one at a time, without feedback until the end, and then get a scorecard: overall %, per-module scores, the lessons to review, and a question-by-question breakdown.

## Entry points
| Kind | Where |
|------|-------|
| URL | `/interview/?mode=mock` (opens the Mock interview tab directly) |
| URL | `/interview/?mode=mock&module=<module-slug>` (pre-selects only that topic) |
| Tab | `/interview/` → tab "Mock interview" (`role=tab`, `#tab-mock`, panel `#panel-mock`) |
| Data | `GET /interview/questions.json` (static, generated at build time) |

## User flows
1. **Set up** — open Mock interview tab → choose Topics (10 checkboxes, all on by default; "Select all" / "Clear") → Level (Mixed / Junior / Mid / Senior, default Mixed) → Questions (5 / 10 / 15, default 10) → Timer (Off / 20 min / 45 min, default Off) → the pool line under the button says how many questions are available → "Start interview".
2. **Answer** — top bar shows "Question i of N", the timer ("mm:ss left") or "No timer", "End interview" and a progress bar. MCQ: pick an option (pressed state only, no right/wrong shown). Open/design: optionally type an answer → "Reveal key points" → tick covered points → rate "Missed it" / "Partly" / "Nailed it". "Next question →" is disabled until answered; "Skip this one" always works. On the last question the buttons read "Finish and see results" / "Skip and finish".
3. **End early** — "End interview" → if any question is unanswered a `confirm()` asks "End now? N unanswered question(s) will count as missed."; OK shows results, Cancel stays.
4. **Time up** — when the timer reaches 0 the results open automatically with a "Time's up." callout.
5. **Results** — score ring (%), verdict line, "x of y multiple-choice correct · x of y open questions nailed · took m:ss", Score by module, Topics to review (links to lessons), Question by question (expandable; MCQ shows correct option and "(your answer)"; open shows model answer), "Start another mock" (back to setup) and "Go to Review later" (only when something was missed).

## Business rules
- Pool = questions whose module is checked AND (level is Mixed OR matches the level).
- Picked count = min(chosen count, pool size); no question repeats within a mock (inferred: pool is shuffled and items are removed as picked).
- Types are interleaved where possible in the pattern MCQ, open, MCQ, design, falling back to any type when one runs out.
- Scoring: MCQ right = 1, wrong = 0; open/design: Missed it = 0, Partly = 0.5, Nailed it = 1; skipped or unanswered = 0. Overall % = round(sum / N × 100).
- Verdict: ≥ 80 % "Strong result…", ≥ 50 % "Solid base…", else "Good practice…".
- No right/wrong feedback is shown during the mock (inferred from "graded at the end").
- On finish every question is recorded to progress (`codegem:answers`), skipped ones as score 0, so missed/partial/skipped questions appear in Review later and update the header stats.
- Timer low state (`.is-low`, red) when under 2 minutes left.
- "Start interview" is disabled when the pool is empty.

## Inputs and limits
| Input | Valid | Invalid / edge |
|-------|-------|----------------|
| Topics | 1–10 modules checked | 0 checked → "Pick at least one topic.", Start disabled |
| Level | Mixed / Junior / Mid / Senior | combination with 0 questions → "No questions for that combination. Try "Mixed" level.", Start disabled (not reachable with current content; every module has ≥ 2 per level) |
| Questions | 5 / 10 / 15 | pool smaller than count → "Only N questions available, so you'll get all of them." and a mock of N |
| Timer | Off / 20 / 45 min | — |
| Open answer textarea | free text | not saved (labelled "only for you, not saved") |
| `?module=` param | a module slug | unknown slug → no topic selected (inferred acceptable) |

## States
| State | When | What the user sees |
|-------|------|--------------------|
| Empty | no topic selected / empty pool | pool line message, Start disabled |
| Loading | before `questions.json` resolves | setup form with an empty pool line |
| Error | `questions.json` fails | "Questions could not be loaded" card (rendered in the Practice panel) |
| Success | mock started / finished | question screen / results scorecard |

## Persistence and side effects
- `localStorage` `codegem:answers` (id → {score, at}), `codegem:days` (streak) written on finish; read by header stats and Review later. Writes fail silently when storage is blocked.
- URL: switching to the tab sets `?mode=mock` via `history.replaceState` (no history entry).
- In-progress mock state lives only in memory: a reload returns to the setup form (inferred; nothing promises resume).

## Acceptance criteria
- **AC-1** `/interview/?mode=mock` and clicking the "Mock interview" tab both show the setup form with all topics checked, Mixed level, 10 questions, timer Off, and a pool line "166 questions available. You'll get 10 at random."
- **AC-2** The pool line and Start button reflect the configuration: no topic → "Pick at least one topic." + disabled; pool < count → "Only N questions available…"; empty pool → "No questions for that combination…" + disabled.
- **AC-3** Starting creates a mock of min(count, pool) questions, all distinct, all from the selected topics and level, showing "Question 1 of N".
- **AC-4** "Next" is disabled until the current question is answered (MCQ choice, or open question revealed and rated); "Skip" always advances; the last question offers "Finish and see results" / "Skip and finish".
- **AC-5** No correctness feedback is shown during the mock.
- **AC-6** Results show the correct overall % (MCQ 1/0, ratings 0/0.5/1, skipped 0), the matching verdict, MCQ/open tallies, per-module scores and a question-by-question list with Correct/Wrong/Skipped/rating tags.
- **AC-7** "End interview" with unanswered questions asks for confirmation; Cancel keeps the mock, OK shows results with the unanswered counted as missed. With everything answered it ends without a prompt.
- **AC-8** With a timer, the bar shows the countdown, turns low (`is-low`) under 2 minutes, and at 0 the results open with "Time's up."
- **AC-9** Finishing records results: header Answered/Accuracy update, missed questions appear in Review later, "Go to Review later" opens that tab; a perfect run shows "Nothing to review…" and no Review button.
- **AC-10** "Start another mock" returns to the setup form with the previous configuration and focus on Start.
- **AC-11** `?mode=mock&module=<slug>` pre-selects only that topic.
- **AC-12** Works by keyboard only; focus moves to the question title on each question and to the results heading on finish; controls have accessible names; results are perceivable by assistive tech.
- **AC-13** No horizontal scroll at 1440px and 375px, in light and dark themes.
- **AC-14** No console errors or page errors during any flow, including when `localStorage` is blocked; a failed `questions.json` shows an error message instead of a broken mock.

## Out of scope
- Practice-by-topic and Review-later modes beyond what the mock hands off to (covered only as the AC-9 integration point).
- Question content correctness (YAML content is validated by `scripts/validate-content.mjs` at build time).
- Browsers other than Chrome (only installed browser; bundled Playwright browsers not downloaded).
- Visual design beyond overflow/visibility checks.
