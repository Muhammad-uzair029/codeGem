# Test cases: Mock interview

> Derived from `01-feature.md`. Every AC is covered by at least one case. Test titles in `e2e/qa/mock-interview.spec.ts` start with the case id.
> Every test also runs an automatic console/page-error guard (AC-14). Default viewport 1440×900, Chrome, fresh `localStorage`.

## Coverage of acceptance criteria
| AC | Cases |
|----|-------|
| AC-1 | TC-01, TC-02 |
| AC-2 | TC-03, TC-04, TC-05 |
| AC-3 | TC-06, TC-07, TC-08 |
| AC-4 | TC-09, TC-10 |
| AC-5 | TC-11 |
| AC-6 | TC-12, TC-13 |
| AC-7 | TC-14, TC-15 |
| AC-8 | TC-16, TC-17 |
| AC-9 | TC-18, TC-19 |
| AC-10 | TC-20 |
| AC-11 | TC-21 |
| AC-12 | TC-22, TC-23 |
| AC-13 | TC-24, TC-25 |
| AC-14 | TC-26, TC-27, (guard on all) |
| — (state) | TC-28, TC-29 |

## Cases

### TC-01 Deep link opens mock setup with defaults
- **AC:** AC-1 · **Priority:** P0 · **Lens:** happy path
- **Preconditions:** none
- **Steps:** 1. Go to `/interview/?mode=mock`.
- **Expected:** "Mock interview" tab selected; heading "Set up your mock interview" visible; 10 topic checkboxes all checked; Mixed, 10, Off checked; pool line "166 questions available. You'll get 10 at random."; Start enabled.

### TC-02 Clicking the tab opens setup and sets the URL
- **AC:** AC-1 · **Priority:** P1 · **Lens:** happy path / state
- **Steps:** 1. Go to `/interview/`. 2. Click tab "Mock interview".
- **Expected:** mock panel visible, practice panel hidden, URL has `?mode=mock`.

### TC-03 No topic selected disables Start
- **AC:** AC-2 · **Priority:** P0 · **Lens:** boundary (zero)
- **Steps:** 1. Open mock. 2. Click "Clear".
- **Expected:** all topics unchecked; "Pick at least one topic."; Start disabled. 3. Click "Select all" → all checked, Start enabled.

### TC-04 Pool smaller than count gives all of them
- **AC:** AC-2, AC-3 · **Priority:** P1 · **Lens:** boundary (pool < count)
- **Steps:** 1. Clear topics, check only "Evals". 2. Level Junior (2 questions). 3. Start.
- **Expected:** "Only 2 questions available, so you'll get all of them."; mock shows "Question 1 of 2".

### TC-05 Empty pool for a combination disables Start
- **AC:** AC-2 · **Priority:** P2 · **Lens:** boundary (empty, via fixture)
- **Preconditions:** `questions.json` served with one module's junior questions removed.
- **Steps:** select only that module, Junior.
- **Expected:** "No questions for that combination. Try "Mixed" level."; Start disabled.

### TC-06 Start builds a 5-question mock from chosen topic and level
- **AC:** AC-3 · **Priority:** P0 · **Lens:** happy path
- **Steps:** 1. Only "RAG", Mid, 5 questions. 2. Start. 3. Skip through all 5 recording each question id.
- **Expected:** "Question 1 of 5"; 5 distinct ids, each belonging to `04-rag` with level `mid`; results list has 5 rows.

### TC-07 15-question mock over all topics has distinct questions and mixed types
- **AC:** AC-3 · **Priority:** P1 · **Lens:** boundary (max)
- **Steps:** count 15, Start, skip through recording ids.
- **Expected:** "of 15"; 15 distinct ids; at least one MCQ, one open and one design question.

### TC-08 Double-submitting Start does not start twice
- **AC:** AC-3 · **Priority:** P2 · **Lens:** double-submit
- **Steps:** double-click Start.
- **Expected:** one mock showing "Question 1 of 10"; setup hidden.

### TC-09 Next is gated on answering MCQ and open questions
- **AC:** AC-4 · **Priority:** P0 · **Lens:** happy path / invalid
- **Preconditions:** deterministic pool (fixture: one MCQ and one open question).
- **Steps:** 1. Start. 2. Check Next disabled + hint. 3. Pick an option → Next enabled. 4. Next. 5. Open question: Next disabled; Reveal key points; tick one point ("You covered 1 of N"); rate "Partly" → button "Finish and see results" enabled.
- **Expected:** as described.

### TC-10 Skip advances and last question shows finish labels
- **AC:** AC-4 · **Priority:** P1 · **Lens:** happy path
- **Steps:** 5 questions; skip 4 times.
- **Expected:** on question 5 buttons read "Skip and finish" and "Finish and see results"; skipping finishes to results.

### TC-11 No correctness feedback during the mock
- **AC:** AC-5 · **Priority:** P1 · **Lens:** business rule
- **Steps:** fixture MCQ; pick the wrong option.
- **Expected:** option is pressed; no `.is-correct`/`.is-wrong` class, no "Correct."/"Not quite" text; options stay enabled and the choice can change.

### TC-12 Score, verdict and tallies are computed correctly
- **AC:** AC-6 · **Priority:** P0 · **Lens:** business rule
- **Preconditions:** fixture with 2 MCQs + 2 open questions in one module.
- **Steps:** answer MCQ #1 right, MCQ #2 wrong, open #1 "Nailed it", open #2 "Partly"; finish.
- **Expected:** score (1+0+1+0.5)/4 = 63 %; verdict "Solid base…"; "1 of 2 multiple-choice correct · 1 of 2 open questions nailed"; tags Correct / Wrong / Nailed it / Partly; module row "63% · 4 questions".

### TC-13 All-skipped run scores 0 % with "Good practice" and Skipped tags
- **AC:** AC-6 · **Priority:** P1 · **Lens:** boundary (zero)
- **Steps:** 5 questions, skip all.
- **Expected:** "0%"; "Good practice…"; 5 "Skipped" tags; review list expands to show model answer or options.

### TC-14 End interview with unanswered: Cancel keeps, OK ends
- **AC:** AC-7 · **Priority:** P0 · **Lens:** happy path / dialog
- **Steps:** start 5; click End interview → dismiss dialog; then End interview → accept.
- **Expected:** dialog text "End now? 5 unanswered question(s) will count as missed."; after Cancel still "Question 1 of 5"; after OK results with 0 %.

### TC-15 End interview with everything answered does not prompt
- **AC:** AC-7 · **Priority:** P2 · **Lens:** dialog
- **Preconditions:** fixture with one MCQ.
- **Steps:** pick an answer; End interview.
- **Expected:** no dialog; results shown.

### TC-16 Timer counts down and goes low under 2 minutes
- **AC:** AC-8 · **Priority:** P1 · **Lens:** timing (`page.clock`)
- **Steps:** install clock; Timer 20 min; Start; fast-forward 10 s; then to 18:01 elapsed.
- **Expected:** "No timer" absent; timer "20:00 left" → "19:50 left"; then text ≤ "1:59 left" and `is-low` class.

### TC-17 Time up opens results with the time's-up notice
- **AC:** AC-8 · **Priority:** P0 · **Lens:** timing
- **Steps:** Timer 20; answer Q1 (fixture MCQ correctly); fast-forward 20:01.
- **Expected:** results with "Time's up." callout; the answered question counted (not lost); unanswered counted as missed.

### TC-18 Finishing updates stats and Review later
- **AC:** AC-9 · **Priority:** P1 · **Lens:** persistence / integration
- **Steps:** 5 questions, skip all; finish; check header; click "Go to Review later"; reload.
- **Expected:** Answered "5", Accuracy "0%", Review badge "5"; Review tab selected with "Needs another look (5)"; after reload Answered still 5.

### TC-19 Perfect run has nothing to review
- **AC:** AC-9 · **Priority:** P2 · **Lens:** boundary (all right)
- **Preconditions:** fixture with one MCQ.
- **Steps:** answer correctly; finish.
- **Expected:** "100%", "Strong result…", "Nothing to review. Every answer was spot on.", no "Go to Review later".

### TC-20 Start another mock returns to setup with previous configuration
- **AC:** AC-10 · **Priority:** P1 · **Lens:** state
- **Steps:** Senior, 5, then Start; skip all; "Start another mock".
- **Expected:** setup visible; Senior and 5 still checked; results gone; Start focused.

### TC-21 Module deep link pre-selects only that topic
- **AC:** AC-11 · **Priority:** P1 · **Lens:** entry point
- **Steps:** go to `/interview/?mode=mock&module=04-rag`.
- **Expected:** only "RAG" checked; pool line "18 questions available. You'll get 10 at random."

### TC-22 Keyboard-only mock run
- **AC:** AC-12 · **Priority:** P1 · **Lens:** accessibility
- **Steps:** on `/interview/` focus the Practice tab, ArrowRight to Mock; Tab to controls; activate Start with keyboard; on the question, Tab to an option and press Enter/Space; Tab to Next and Enter; end via keyboard.
- **Expected:** Mock tab selected and focused after ArrowRight; question title focused after Start and after Next; results heading focused after finish.

### TC-23 Overall score is exposed to assistive technology
- **AC:** AC-12 · **Priority:** P2 · **Lens:** accessibility (labels/roles)
- **Steps:** finish an all-skipped run; read the accessibility tree of the results section.
- **Expected:** the overall percentage ("0%") is present in the accessible content (not only in an `aria-hidden` element).

### TC-24 No horizontal scroll at 375px (setup, question, results)
- **AC:** AC-13 · **Priority:** P1 · **Lens:** layout
- **Steps:** viewport 375×812; setup → start → open question revealed → results; measure overflow each time; screenshot.
- **Expected:** `scrollWidth - innerWidth ≤ 1` at each step.

### TC-25 No horizontal scroll at 1440px in light and dark themes
- **AC:** AC-13 · **Priority:** P2 · **Lens:** layout / themes
- **Steps:** for `cg-theme` light and dark: setup → question → results; measure; screenshot.
- **Expected:** no overflow; `data-theme` applied.

### TC-26 Blocked localStorage does not break the mock
- **AC:** AC-14 · **Priority:** P1 · **Lens:** storage unavailable
- **Steps:** init script makes `localStorage` throw; run a 5-question all-skip mock.
- **Expected:** results render; no page/console errors.

### TC-27 questions.json failure shows an error instead of a broken mock
- **AC:** AC-14 · **Priority:** P1 · **Lens:** error/offline
- **Steps:** route `/interview/questions.json` → 500; go to `/interview/?mode=mock`.
- **Expected:** a visible "Questions could not be loaded" message on the page the user is looking at; Start disabled or absent (a 500 resource console error is expected and allowed in this case only).

### TC-28 Switching tabs mid-mock keeps progress
- **AC:** AC-3, AC-4 · **Priority:** P2 · **Lens:** state
- **Steps:** start; skip to Q2; click Practice tab; click Mock tab.
- **Expected:** still "Question 2 of 10".

### TC-29 Reload mid-mock returns to setup without errors
- **AC:** — (inferred; see Decision needed) · **Priority:** P2 · **Lens:** state (reload)
- **Steps:** start; skip to Q3; reload.
- **Expected:** mock tab open with the setup form; no errors; nothing recorded (Answered 0).
