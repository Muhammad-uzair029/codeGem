// feature-qa: Mock interview (/interview/?mode=mock) on the static site.
// Cases: docs/qa/mock-interview/02-test-cases.md. Every title starts with its case id.
// Prereq: cd site && npm run build   (this spec serves site/dist itself).
import { test as base, expect, type Page, type Locator } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, '..', '..', 'site', 'dist');
const EVIDENCE = path.resolve(here, '..', '..', 'docs', 'qa', 'mock-interview', 'evidence');
const DATA = JSON.parse(fs.readFileSync(path.join(DIST, 'interview', 'questions.json'), 'utf8')) as {
  modules: { slug: string; short: string }[];
  questions: { id: string; module: string; type: 'mcq' | 'open' | 'design'; level: string; answer?: number; keyPoints?: string[] }[];
};
const byId = new Map(DATA.questions.map((q) => [q.id, q]));

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain' };

type Fixtures = { allowErrors: RegExp[]; consoleGuard: void };
type WorkerFixtures = { siteURL: string };

const test = base.extend<Fixtures, WorkerFixtures>({
  siteURL: [async ({}, use) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://x');
      let file = path.join(DIST, decodeURIComponent(url.pathname));
      if (!file.startsWith(DIST)) { res.statusCode = 403; return res.end(); }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
      res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    await new Promise((r) => server.close(r));
  }, { scope: 'worker' }],
  baseURL: async ({ siteURL }, use) => use(siteURL),
  allowErrors: [[], { option: true }],
  consoleGuard: [async ({ page, allowErrors }, use) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await use();
    expect(errors.filter((e) => !allowErrors.some((r) => r.test(e))), 'console/page errors').toEqual([]);
  }, { auto: true }],
});

/* ---------- helpers ---------- */
const panel = (page: Page) => page.locator('#panel-mock');
const startBtn = (page: Page) => page.getByRole('button', { name: 'Start interview' });
const poolLine = (page: Page) => page.locator('[data-mock-pool]');
const counter = (page: Page) => panel(page).locator('.mock-bar strong');
const results = (page: Page) => page.getByRole('heading', { name: 'Your interview results' });

async function openMock(page: Page, qs = '') {
  await page.goto(`/interview/?mode=mock${qs}`);
  await expect(poolLine(page)).not.toBeEmpty();
}
async function onlyTopic(page: Page, short: string) {
  await panel(page).getByRole('button', { name: 'Clear' }).click();
  await panel(page).getByRole('checkbox', { name: short, exact: true }).check();
}
const radio = (page: Page, name: string) => panel(page).getByRole('radio', { name, exact: true });
async function currentId(page: Page) {
  return (await panel(page).locator('article.iv-q').getAttribute('data-qid'))!;
}
/** Skip every question, returning the ids seen. */
async function skipAll(page: Page) {
  const ids: string[] = [];
  for (let i = 0; i < 20; i++) {
    if (await results(page).isVisible()) break;
    ids.push(await currentId(page));
    await panel(page).getByRole('button', { name: /^Skip (this one|and finish)$/ }).click();
  }
  await expect(results(page)).toBeVisible();
  return ids;
}
/** Serve questions.json with only the given questions. */
async function serveQuestions(page: Page, filter: (q: (typeof DATA.questions)[number]) => boolean) {
  const body = JSON.stringify({ ...DATA, questions: DATA.questions.filter(filter) });
  await page.route('**/interview/questions.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body }));
}
/** Pick N ids of a type from one module (deterministic). */
const pick = (module: string, type: string, n: number) => DATA.questions.filter((q) => q.module === module && q.type === type).slice(0, n).map((q) => q.id);
const options = (page: Page) => panel(page).locator('article.iv-q .quiz-option');
async function answerMcq(page: Page, correct: boolean) {
  const q = byId.get(await currentId(page))!;
  const n = await options(page).count();
  const idx = correct ? q.answer! : (q.answer! + 1) % n;
  await options(page).nth(idx).click();
}
async function rateOpen(page: Page, label: 'Missed it' | 'Partly' | 'Nailed it') {
  await panel(page).getByRole('button', { name: 'Reveal key points' }).click();
  await panel(page).getByRole('button', { name: label, exact: true }).click();
}
const nextBtn = (page: Page) => panel(page).getByRole('button', { name: /^(Next question →|Finish and see results)$/ });
async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true });
async function tabUntil(page: Page, target: Locator, max = 40) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

/* ---------- AC-1 ---------- */
test('TC-01 Deep link opens mock setup with defaults', async ({ page }) => {
  await openMock(page);
  await expect(page.getByRole('tab', { name: /Mock interview/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Set up your mock interview' })).toBeVisible();
  const boxes = panel(page).getByRole('checkbox');
  await expect(boxes).toHaveCount(10);
  for (const b of await boxes.all()) await expect(b).toBeChecked();
  await expect(radio(page, 'Mixed')).toBeChecked();
  await expect(radio(page, '10')).toBeChecked();
  await expect(radio(page, 'Off')).toBeChecked();
  await expect(poolLine(page)).toHaveText(`${DATA.questions.length} questions available. You'll get 10 at random.`);
  await expect(startBtn(page)).toBeEnabled();
  await shot(page, 'TC-01-setup');
});

test('TC-02 Clicking the tab opens setup and sets the URL', async ({ page }) => {
  await page.goto('/interview/');
  await expect(page.locator('[data-practice-count]')).not.toHaveText('Loading questions…');
  await page.getByRole('tab', { name: /Mock interview/ }).click();
  await expect(panel(page)).toBeVisible();
  await expect(page.locator('#panel-practice')).toBeHidden();
  await expect(page).toHaveURL(/\?mode=mock$/);
});

/* ---------- AC-2 ---------- */
test('TC-03 No topic selected disables Start', async ({ page }) => {
  await openMock(page);
  await panel(page).getByRole('button', { name: 'Clear' }).click();
  for (const b of await panel(page).getByRole('checkbox').all()) await expect(b).not.toBeChecked();
  await expect(poolLine(page)).toHaveText('Pick at least one topic.');
  await expect(startBtn(page)).toBeDisabled();
  await panel(page).getByRole('button', { name: 'Select all' }).click();
  for (const b of await panel(page).getByRole('checkbox').all()) await expect(b).toBeChecked();
  await expect(startBtn(page)).toBeEnabled();
});

test('TC-04 Pool smaller than count gives all of them', async ({ page }) => {
  const n = DATA.questions.filter((q) => q.module === '06-evaluation-observability' && q.level === 'junior').length;
  await openMock(page);
  await onlyTopic(page, 'Evals');
  await radio(page, 'Junior').check();
  await expect(poolLine(page)).toHaveText(`Only ${n} question${n === 1 ? '' : 's'} available, so you'll get all of them.`);
  await startBtn(page).click();
  await expect(counter(page)).toHaveText(`Question 1 of ${n}`);
});

test('TC-05 Empty pool for a combination disables Start', async ({ page }) => {
  await serveQuestions(page, (q) => !(q.module === '04-rag' && q.level === 'junior'));
  await openMock(page);
  await onlyTopic(page, 'RAG');
  await radio(page, 'Junior').check();
  await expect(poolLine(page)).toHaveText('No questions for that combination. Try "Mixed" level.');
  await expect(startBtn(page)).toBeDisabled();
});

/* ---------- AC-3 ---------- */
test('TC-06 Start builds a 5-question mock from chosen topic and level', async ({ page }) => {
  await openMock(page);
  await onlyTopic(page, 'RAG');
  await radio(page, 'Mid').check();
  await radio(page, '5').check();
  await startBtn(page).click();
  await expect(counter(page)).toHaveText('Question 1 of 5');
  await expect(page.locator('[data-mock-setup]')).toBeHidden();
  const ids = await skipAll(page);
  expect(new Set(ids).size).toBe(5);
  for (const id of ids) expect(byId.get(id)).toMatchObject({ module: '04-rag', level: 'mid' });
  await expect(page.locator('.sum-review-list > li')).toHaveCount(5);
});

test('TC-07 15-question mock over all topics has distinct questions and mixed types', async ({ page }) => {
  await openMock(page);
  await radio(page, '15').check();
  await startBtn(page).click();
  await expect(counter(page)).toHaveText('Question 1 of 15');
  const ids = await skipAll(page);
  expect(new Set(ids).size).toBe(15);
  const types = new Set(ids.map((id) => byId.get(id)!.type));
  expect([...types].sort()).toEqual(['design', 'mcq', 'open']);
});

test('TC-08 Double-submitting Start does not start twice', async ({ page }) => {
  await openMock(page);
  await startBtn(page).dblclick();
  await expect(counter(page)).toHaveText('Question 1 of 10');
  await expect(panel(page).locator('.mock-bar')).toHaveCount(1);
  await expect(page.locator('[data-mock-setup]')).toBeHidden();
});

/* ---------- AC-4 ---------- */
test('TC-09 Next is gated on answering MCQ and open questions', async ({ page }) => {
  const ids = [...pick('04-rag', 'mcq', 1), ...pick('04-rag', 'open', 1)];
  await serveQuestions(page, (q) => ids.includes(q.id));
  await openMock(page);
  await startBtn(page).click();
  await expect(counter(page)).toHaveText('Question 1 of 2');
  // interleave order is mcq, open
  expect(byId.get(await currentId(page))!.type).toBe('mcq');
  await expect(nextBtn(page)).toBeDisabled();
  await expect(panel(page).locator('.iv-next-hint')).toHaveText('Pick an answer to continue (or skip).');
  await answerMcq(page, false);
  await expect(nextBtn(page)).toBeEnabled();
  await nextBtn(page).click();
  await expect(counter(page)).toHaveText('Question 2 of 2');
  await expect(nextBtn(page)).toHaveText('Finish and see results');
  await expect(nextBtn(page)).toBeDisabled();
  await expect(panel(page).locator('.iv-next-hint')).toHaveText('Reveal the key points and rate yourself to continue (or skip).');
  await panel(page).getByRole('textbox', { name: /Your answer/ }).fill('Chunk, embed, retrieve, rerank.');
  await panel(page).getByRole('button', { name: 'Reveal key points' }).click();
  await expect(nextBtn(page)).toBeDisabled();
  const kp = byId.get(await currentId(page))!.keyPoints!.length;
  await panel(page).locator('.iv-checklist input').first().check();
  await expect(panel(page).locator('.iv-covered')).toHaveText(`You covered 1 of ${kp} key points`);
  await panel(page).getByRole('button', { name: 'Partly', exact: true }).click();
  await expect(nextBtn(page)).toBeEnabled();
  await nextBtn(page).click();
  await expect(results(page)).toBeVisible();
});

test('TC-10 Skip advances and last question shows finish labels', async ({ page }) => {
  await openMock(page);
  await radio(page, '5').check();
  await startBtn(page).click();
  for (let i = 1; i < 5; i++) {
    await expect(counter(page)).toHaveText(`Question ${i} of 5`);
    await panel(page).getByRole('button', { name: 'Skip this one' }).click();
  }
  await expect(counter(page)).toHaveText('Question 5 of 5');
  await expect(panel(page).getByRole('button', { name: 'Skip and finish' })).toBeVisible();
  await expect(nextBtn(page)).toHaveText('Finish and see results');
  await panel(page).getByRole('button', { name: 'Skip and finish' }).click();
  await expect(results(page)).toBeVisible();
});

/* ---------- AC-5 ---------- */
test('TC-11 No correctness feedback during the mock', async ({ page }) => {
  const ids = pick('01-llm-foundations', 'mcq', 1);
  await serveQuestions(page, (q) => ids.includes(q.id));
  await openMock(page);
  await startBtn(page).click();
  await answerMcq(page, false);
  const q = byId.get(await currentId(page))!;
  const wrong = (q.answer! + 1) % (await options(page).count());
  await expect(options(page).nth(wrong)).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page).locator('.is-correct, .is-wrong')).toHaveCount(0);
  await expect(panel(page).getByText(/^(Correct\.|Not quite)/)).toHaveCount(0);
  for (const o of await options(page).all()) await expect(o).toBeEnabled();
  await options(page).nth(q.answer!).click();
  await expect(options(page).nth(q.answer!)).toHaveAttribute('aria-pressed', 'true');
  await expect(options(page).nth(wrong)).toHaveAttribute('aria-pressed', 'false');
});

/* ---------- AC-6 ---------- */
test('TC-12 Score, verdict and tallies are computed correctly', async ({ page }) => {
  const ids = [...pick('04-rag', 'mcq', 2), ...pick('04-rag', 'open', 2)];
  await serveQuestions(page, (q) => ids.includes(q.id));
  await openMock(page);
  await startBtn(page).click();
  // Order: mcq, open, mcq, open (design fallback picks open)
  await answerMcq(page, true); await nextBtn(page).click();
  await rateOpen(page, 'Nailed it'); await nextBtn(page).click();
  await answerMcq(page, false); await nextBtn(page).click();
  await rateOpen(page, 'Partly'); await nextBtn(page).click();
  await expect(results(page)).toBeVisible();
  const sum = page.locator('section.sum');
  await expect(sum.locator('.sum-score')).toHaveText('63%');
  await expect(sum).toContainText('Solid base. Review the lessons below to close the gaps.');
  await expect(sum).toContainText('1 of 2 multiple-choice correct · 1 of 2 open questions nailed');
  await expect(sum.locator('.sum-mod')).toHaveCount(1);
  await expect(sum.locator('.sum-mod')).toContainText('63% · 4 questions');
  const tags = page.locator('.sum-review summary .tag');
  await expect(tags).toHaveText(['Correct', 'Nailed it', 'Wrong', 'Partly']);
  await shot(page, 'TC-12-results');
});

test('TC-13 All-skipped run scores 0% with Good practice and Skipped tags', async ({ page }) => {
  await openMock(page);
  await radio(page, '5').check();
  await startBtn(page).click();
  await skipAll(page);
  await expect(page.locator('.sum-score')).toHaveText('0%');
  await expect(page.locator('section.sum')).toContainText('Good practice. Start with the lessons below, then try again.');
  await expect(page.locator('.sum-review summary .tag')).toHaveText(Array(5).fill('Skipped'));
  const first = page.locator('.sum-review').first();
  await first.locator('summary').click();
  await expect(first.locator('.sum-review-body')).toBeVisible();
  await expect(first.locator('.sum-review-body a', { hasText: 'Lesson:' })).toBeVisible();
});

/* ---------- AC-7 ---------- */
test('TC-14 End interview with unanswered: Cancel keeps, OK ends', async ({ page }) => {
  await openMock(page);
  await radio(page, '5').check();
  await startBtn(page).click();
  let msg = '';
  page.once('dialog', (d) => { msg = d.message(); void d.dismiss(); });
  await panel(page).getByRole('button', { name: 'End interview' }).click();
  expect(msg).toBe('End now? 5 unanswered question(s) will count as missed.');
  await expect(counter(page)).toHaveText('Question 1 of 5');
  page.once('dialog', (d) => void d.accept());
  await panel(page).getByRole('button', { name: 'End interview' }).click();
  await expect(results(page)).toBeVisible();
  await expect(page.locator('.sum-score')).toHaveText('0%');
});

test('TC-15 End interview with everything answered does not prompt', async ({ page }) => {
  const ids = pick('02-prompt-engineering', 'mcq', 1);
  await serveQuestions(page, (q) => ids.includes(q.id));
  await openMock(page);
  await startBtn(page).click();
  await answerMcq(page, true);
  let dialogs = 0;
  page.on('dialog', (d) => { dialogs++; void d.dismiss(); });
  await panel(page).getByRole('button', { name: 'End interview' }).click();
  await expect(results(page)).toBeVisible();
  expect(dialogs).toBe(0);
});

/* ---------- AC-8 ---------- */
test('TC-16 Timer counts down and goes low under 2 minutes', async ({ page }) => {
  await page.clock.install();
  await openMock(page);
  await radio(page, '20 min').check();
  await startBtn(page).click();
  const timer = panel(page).getByRole('timer');
  await expect(panel(page).getByText('No timer')).toHaveCount(0);
  await expect(timer).toHaveText('20:00 left');
  await page.clock.runFor(10_000);
  await expect(timer).toHaveText('19:50 left');
  await expect(timer).not.toHaveClass(/is-low/);
  await page.clock.runFor((18 * 60 + 1) * 1000 - 10_000);
  await expect(timer).toHaveText('1:59 left');
  await expect(timer).toHaveClass(/is-low/);
  await shot(page, 'TC-16-timer-low');
});

test('TC-17 Time up opens results with the time\'s-up notice', async ({ page }) => {
  const ids = [...pick('05-agents-tool-calling', 'mcq', 2)];
  await serveQuestions(page, (q) => ids.includes(q.id));
  await page.clock.install();
  await openMock(page);
  await radio(page, '20 min').check();
  await startBtn(page).click();
  await answerMcq(page, true);
  await nextBtn(page).click();
  await expect(counter(page)).toHaveText('Question 2 of 2');
  await page.clock.runFor(20 * 60 * 1000 + 1000);
  await expect(results(page)).toBeVisible();
  await expect(page.locator('.callout.warning')).toHaveText("Time's up. Unanswered questions count as missed.");
  await expect(page.locator('.sum-score')).toHaveText('50%');
  await expect(page.locator('.sum-review summary .tag')).toHaveText(['Correct', 'Skipped']);
  await shot(page, 'TC-17-time-up');
});

/* ---------- AC-9 ---------- */
test('TC-18 Finishing updates stats and Review later', async ({ page }) => {
  await openMock(page);
  await expect(page.locator('[data-stat="answered"]')).toHaveText('0');
  await radio(page, '5').check();
  await startBtn(page).click();
  await skipAll(page);
  await expect(page.locator('[data-stat="answered"]')).toHaveText('5');
  await expect(page.locator('[data-stat="accuracy"]')).toHaveText('0%');
  await expect(page.locator('[data-review-count]')).toHaveText('5');
  await page.getByRole('button', { name: 'Go to Review later' }).click();
  await expect(page.getByRole('tab', { name: /Review later/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#panel-review')).toContainText('Needs another look (5)');
  await page.reload();
  await expect(page.locator('[data-stat="answered"]')).toHaveText('5');
});

test('TC-19 Perfect run has nothing to review', async ({ page }) => {
  const ids = pick('03-embeddings-vector-search', 'mcq', 1);
  await serveQuestions(page, (q) => ids.includes(q.id));
  await openMock(page);
  await startBtn(page).click();
  await answerMcq(page, true);
  await nextBtn(page).click();
  await expect(page.locator('.sum-score')).toHaveText('100%');
  await expect(page.locator('section.sum')).toContainText("Strong result. You're interview-ready on these topics.");
  await expect(page.locator('section.sum')).toContainText('Nothing to review. Every answer was spot on.');
  await expect(page.getByRole('button', { name: 'Go to Review later' })).toHaveCount(0);
});

/* ---------- AC-10 ---------- */
test('TC-20 Start another mock returns to setup with previous configuration', async ({ page }) => {
  await openMock(page);
  await radio(page, 'Senior').check();
  await radio(page, '5').check();
  await startBtn(page).click();
  await skipAll(page);
  await page.getByRole('button', { name: 'Start another mock' }).click();
  await expect(page.getByRole('heading', { name: 'Set up your mock interview' })).toBeVisible();
  await expect(radio(page, 'Senior')).toBeChecked();
  await expect(radio(page, '5')).toBeChecked();
  await expect(results(page)).toHaveCount(0);
  await expect(startBtn(page)).toBeFocused();
});

/* ---------- AC-11 ---------- */
test('TC-21 Module deep link pre-selects only that topic', async ({ page }) => {
  const n = DATA.questions.filter((q) => q.module === '04-rag').length;
  await openMock(page, '&module=04-rag');
  for (const b of await panel(page).getByRole('checkbox').all()) {
    if ((await b.getAttribute('value')) === '04-rag') await expect(b).toBeChecked();
    else await expect(b).not.toBeChecked();
  }
  await expect(poolLine(page)).toHaveText(`${n} questions available. You'll get 10 at random.`);
});

/* ---------- AC-12 ---------- */
test('TC-22 Keyboard-only mock run', async ({ page }) => {
  const ids = pick('07-production-ai-architecture', 'mcq', 2);
  await serveQuestions(page, (q) => ids.includes(q.id));
  await page.goto('/interview/');
  await expect(page.locator('[data-practice-count]')).not.toHaveText('Loading questions…');
  await page.getByRole('tab', { name: /Practice by topic/ }).focus();
  await page.keyboard.press('ArrowRight');
  const mockTab = page.getByRole('tab', { name: /Mock interview/ });
  await expect(mockTab).toBeFocused();
  await expect(mockTab).toHaveAttribute('aria-selected', 'true');
  await tabUntil(page, startBtn(page));
  await page.keyboard.press('Enter');
  await expect(panel(page).locator('.iv-q-title')).toBeFocused();
  for (let i = 0; i < 2; i++) {
    await tabUntil(page, options(page).first());
    await page.keyboard.press('Space');
    await expect(options(page).first()).toHaveAttribute('aria-pressed', 'true');
    await tabUntil(page, nextBtn(page));
    await page.keyboard.press('Enter');
    if (i === 0) await expect(panel(page).locator('.iv-q-title')).toBeFocused();
  }
  await expect(results(page)).toBeFocused();
});

test('TC-23 Overall score is exposed to assistive technology', async ({ page }) => {
  test.fail(true, 'BUG-1: the overall score ring is aria-hidden, so the percentage is missing from the accessibility tree');
  // Two modules, one right and one wrong: overall 50%, module rows 100% / 0%,
  // so "50%" can only come from the overall score.
  const ids = [...pick('01-llm-foundations', 'mcq', 1), ...pick('02-prompt-engineering', 'mcq', 1)];
  await serveQuestions(page, (q) => ids.includes(q.id));
  await openMock(page);
  await startBtn(page).click();
  await answerMcq(page, true); await nextBtn(page).click();
  await answerMcq(page, false); await nextBtn(page).click();
  await expect(page.locator('.sum-score')).toHaveText('50%');
  await shot(page, 'TC-23-results-score-aria-hidden');
  const tree = await page.locator('section.sum').ariaSnapshot();
  expect(tree).toContain('50%');
});

/* ---------- AC-13 ---------- */
test('TC-24 No horizontal scroll at 375px (setup, question, results)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const ids = [...pick('09-ai-system-design', 'mcq', 1), ...pick('09-ai-system-design', 'design', 1)];
  await serveQuestions(page, (q) => ids.includes(q.id));
  await openMock(page);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  await shot(page, 'TC-24-375-setup');
  await startBtn(page).click();
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  await answerMcq(page, true);
  await nextBtn(page).click();
  await panel(page).getByRole('button', { name: 'Reveal key points' }).click();
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  await shot(page, 'TC-24-375-question');
  await panel(page).getByRole('button', { name: 'Nailed it', exact: true }).click();
  await nextBtn(page).click();
  await expect(results(page)).toBeVisible();
  await page.locator('.sum-review summary').first().click();
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  await shot(page, 'TC-24-375-results');
});

for (const theme of ['light', 'dark'] as const) {
  test(`TC-25 No horizontal scroll at 1440px in ${theme} theme`, async ({ page }) => {
    await page.addInitScript((t) => { try { localStorage.setItem('cg-theme', t); } catch {} }, theme);
    await openMock(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await radio(page, '5').check();
    await radio(page, '45 min').check();
    await startBtn(page).click();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await shot(page, `TC-25-${theme}-question`);
    await skipAll(page);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await shot(page, `TC-25-${theme}-results`);
  });
}

/* ---------- AC-14 ---------- */
test('TC-26 Blocked localStorage does not break the mock', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  });
  await openMock(page);
  await radio(page, '5').check();
  await startBtn(page).click();
  await skipAll(page);
  await expect(page.locator('.sum-score')).toHaveText('0%');
});

test.describe(() => {
  test.use({ allowErrors: [/Failed to load resource: the server responded with a status of 500/] });
  test('TC-27 questions.json failure shows an error instead of a broken mock', async ({ page }) => {
    await page.route('**/interview/questions.json', (r) => r.fulfill({ status: 500, body: 'boom' }));
    await page.goto('/interview/?mode=mock');
    await expect(page.getByText('Questions could not be loaded')).toBeVisible();
    // The mock setup must not offer a Start that silently does nothing.
    const start = startBtn(page);
    if (await start.isVisible()) await expect(start).toBeDisabled();
    await shot(page, 'TC-27-load-error');
  });
});

/* ---------- state ---------- */
test('TC-28 Switching tabs mid-mock keeps progress', async ({ page }) => {
  await openMock(page);
  await startBtn(page).click();
  await panel(page).getByRole('button', { name: 'Skip this one' }).click();
  await expect(counter(page)).toHaveText('Question 2 of 10');
  await page.getByRole('tab', { name: /Practice by topic/ }).click();
  await expect(panel(page)).toBeHidden();
  await page.getByRole('tab', { name: /Mock interview/ }).click();
  await expect(counter(page)).toHaveText('Question 2 of 10');
});

test('TC-29 Reload mid-mock returns to setup without errors', async ({ page }) => {
  await openMock(page);
  await startBtn(page).click();
  await panel(page).getByRole('button', { name: 'Skip this one' }).click();
  await panel(page).getByRole('button', { name: 'Skip this one' }).click();
  await expect(counter(page)).toHaveText('Question 3 of 10');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Set up your mock interview' })).toBeVisible();
  await expect(page.locator('[data-stat="answered"]')).toHaveText('0');
});
