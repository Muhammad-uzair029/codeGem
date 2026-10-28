// Interview prep: practice by topic, mock interview, review later.
// Questions come from /interview/questions.json (built at build time, HTML
// already escaped/rendered). Answers, bookmarks and the streak live in
// localStorage via learn-store.js.
import { getAnswers, recordAnswer, getBookmarks, toggleBookmark, streak, setBar } from './learn-store.js';

const TYPE_LABEL = { mcq: 'Multiple choice', open: 'Open answer', design: 'System design' };
const LEVEL_LABEL = { junior: 'Junior', mid: 'Mid', senior: 'Senior' };
const RATINGS = [
  { key: 'missed', label: 'Missed it', score: 0 },
  { key: 'partial', label: 'Partly', score: 0.5 },
  { key: 'nailed', label: 'Nailed it', score: 1 },
];

let DATA = { modules: [], questions: [] };
let byId = new Map();
let seq = 0;

/* ---------- tiny DOM helper ---------- */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // only build-time rendered, escaped HTML
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

/* ---------- stats ---------- */
function paintStats() {
  const answers = getAnswers();
  const vals = Object.entries(answers).filter(([id]) => byId.has(id)).map(([, v]) => v);
  const set = (k, v) => {
    const el = $(`[data-stat="${k}"]`);
    if (el) el.textContent = v;
  };
  set('answered', String(vals.length));
  set('accuracy', vals.length ? `${Math.round((vals.reduce((n, v) => n + (Number(v.score) || 0), 0) / vals.length) * 100)}%` : '–');
  set('streak', String(streak()));
  const n = reviewIds().length;
  const badge = $('[data-review-count]');
  if (badge) {
    badge.textContent = String(n);
    badge.hidden = n === 0;
  }
}
function reviewIds() {
  const answers = getAnswers();
  const ids = new Set(getBookmarks().filter((id) => byId.has(id)));
  for (const [id, v] of Object.entries(answers)) if (byId.has(id) && Number(v.score) < 1) ids.add(id);
  return [...ids];
}

/* ---------- question card ----------
 * mode 'practice': MCQs graded on click; open questions reveal + self-rate.
 * mode 'mock': MCQs only record the choice; open questions must be rated.
 * onChange(state) is called when the user answers/rates.
 */
function questionCard(q, { mode = 'practice', index, total, onChange } = {}) {
  const id = `q-${++seq}`;
  const state = { id: q.id, choice: null, rating: null, score: null };
  const answers = getAnswers();
  const prev = answers[q.id];
  const bookmarked = getBookmarks().includes(q.id);

  const bm = h('button', { type: 'button', class: 'iv-bookmark', 'aria-pressed': String(bookmarked), title: 'Save this question to Review later' },
    svgIcon('bookmark'), h('span', { 'data-bm-label': '' }, bookmarked ? 'Saved' : 'Save'));
  bm.addEventListener('click', () => {
    const on = toggleBookmark(q.id);
    bm.setAttribute('aria-pressed', String(on));
    bm.querySelector('[data-bm-label]').textContent = on ? 'Saved' : 'Save';
    paintStats();
  });

  const head = h('div', { class: 'iv-q-head' },
    h('div', { class: 'tag-row' },
      index != null ? h('span', { class: 'tag tag-accent' }, `Question ${index + 1} of ${total}`) : null,
      h('span', { class: 'tag' }, q.moduleShort),
      h('span', { class: 'tag' }, TYPE_LABEL[q.type]),
      h('span', { class: 'tag' }, LEVEL_LABEL[q.level]),
      mode === 'practice' && prev ? h('span', { class: `tag ${prev.score >= 1 ? 'tag-accent' : 'tag-warn'}` }, prev.score >= 1 ? 'Got it before' : 'Missed before') : null,
    ),
    bm,
  );
  const title = h('h3', { class: 'iv-q-title', id: `${id}-t`, tabindex: '-1', html: q.question });
  const card = h('article', { class: 'card iv-q', 'aria-labelledby': `${id}-t`, 'data-qid': q.id }, head, title);

  if (q.type === 'mcq') {
    const fb = h('div', { class: 'iv-feedback', hidden: true, role: 'status' });
    const opts = q.options.map((o, i) =>
      h('li', {}, h('button', { type: 'button', class: 'quiz-option', 'aria-pressed': 'false', html: o, onclick: () => choose(i) })),
    );
    const list = h('ul', { class: 'quiz-options', 'aria-label': 'Answer options' }, opts);
    card.append(list, fb);
    const buttons = () => $$('.quiz-option', list);
    function choose(i) {
      state.choice = i;
      state.score = i === q.answer ? 1 : 0;
      if (mode === 'mock') {
        buttons().forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
        onChange?.(state);
        return;
      }
      buttons().forEach((b, j) => {
        b.disabled = true;
        b.setAttribute('aria-pressed', String(j === i));
        b.classList.toggle('is-correct', j === q.answer);
        b.classList.toggle('is-wrong', j === i && i !== q.answer);
      });
      fb.hidden = false;
      fb.className = `iv-feedback ${state.score ? 'is-right' : 'is-miss'}`;
      fb.replaceChildren(
        h('p', { class: 'iv-verdict' }, state.score ? 'Correct.' : 'Not quite. The correct answer is highlighted.'),
        h('div', { class: 'iv-expl', html: q.explanation }),
        h('button', { type: 'button', class: 'l-textbtn', onclick: reset }, 'Try again'),
      );
      recordAnswer(q.id, state.score);
      paintStats();
      onChange?.(state);
    }
    function reset() {
      state.choice = state.score = null;
      buttons().forEach((b) => {
        b.disabled = false;
        b.setAttribute('aria-pressed', 'false');
        b.classList.remove('is-correct', 'is-wrong');
      });
      fb.hidden = true;
      buttons()[0].focus();
    }
  } else {
    const ta = h('textarea', { id: `${id}-a`, rows: q.type === 'design' ? 7 : 4, placeholder: q.type === 'design' ? 'Sketch your design: requirements, components, data flow, trade-offs…' : 'Write or outline your answer…' });
    const taWrap = h('div', { class: 'iv-answer' },
      h('label', { for: `${id}-a` }, 'Your answer ', h('span', { class: 'faint' }, '(only for you, not saved)')),
      ta,
    );
    const revealBtn = h('button', { type: 'button', class: 'btn', onclick: reveal }, 'Reveal key points');
    const revealRow = h('div', { class: 'iv-actions' }, revealBtn, h('span', { class: 'faint' }, 'Then tick what you covered.'));
    const after = h('div', { class: 'iv-reveal', hidden: true });
    card.append(taWrap, revealRow, after);

    function reveal() {
      revealRow.hidden = true;
      after.hidden = false;
      const covered = h('p', { class: 'iv-covered', 'aria-live': 'polite' }, `You covered 0 of ${q.keyPoints.length} key points`);
      const checks = q.keyPoints.map((k, i) => {
        const cid = `${id}-k${i}`;
        return h('li', {}, h('input', { type: 'checkbox', id: cid, onchange: count }), h('label', { for: cid, html: k }));
      });
      function count() {
        const n = $$('input:checked', after).length;
        covered.textContent = `You covered ${n} of ${q.keyPoints.length} key points`;
      }
      const rateBtns = RATINGS.map((r) =>
        h('button', { type: 'button', class: `iv-rate iv-rate-${r.key}`, 'aria-pressed': 'false', onclick: () => rate(r) }, r.label),
      );
      const rateMsg = h('p', { class: 'faint iv-rate-msg', 'aria-live': 'polite' });
      after.append(
        h('h4', { class: 'iv-sub' }, 'Key points a strong answer hits'),
        h('ul', { class: 'iv-checklist' }, checks),
        covered,
        h('details', { class: 'iv-model', open: true }, h('summary', {}, 'Model answer'), h('div', { class: 'iv-model-body', html: q.modelAnswer })),
        q.followUps?.length ? h('div', { class: 'iv-followups' }, h('h4', { class: 'iv-sub' }, 'Follow-ups interviewers like'), h('ul', {}, q.followUps.map((f) => h('li', { html: f })))) : null,
        h('div', { class: 'iv-rating', role: 'group', 'aria-label': 'How did you do?' }, h('span', { class: 'iv-rating-label' }, 'How did you do?'), ...rateBtns),
        rateMsg,
      );
      after.querySelector('input')?.focus();
      function rate(r) {
        state.rating = r.key;
        state.score = r.score;
        rateBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(RATINGS[i] === r)));
        if (mode === 'practice') {
          recordAnswer(q.id, r.score);
          paintStats();
          rateMsg.textContent = r.score < 1 ? 'Saved. This question is now in Review later.' : 'Saved.';
        }
        onChange?.(state);
      }
    }
  }

  card.append(h('p', { class: 'iv-q-foot' }, h('a', { href: q.lessonUrl }, `Lesson: ${q.lessonTitle} →`)));
  return card;
}

function svgIcon(name) {
  const paths = { bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>' };
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', '16');
  s.setAttribute('height', '16');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = paths[name];
  return s;
}

/* ---------- mode tabs ---------- */
let currentMode = 'practice';
function setMode(mode, { focus = false, push = true } = {}) {
  currentMode = mode;
  $$('[role="tab"][data-mode]').forEach((t) => {
    const on = t.dataset.mode === mode;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  });
  $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== mode));
  if (mode === 'review') renderReview();
  if (push) {
    const p = new URLSearchParams(location.search);
    if (mode === 'practice') p.delete('mode');
    else {
      p.set('mode', mode);
      for (const k of ['module', 'lesson', 'type', 'level', 'q']) p.delete(k);
    }
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
    if (mode === 'practice') syncPracticeUrl();
  }
}
function initTabs() {
  const tabs = $$('[role="tab"][data-mode]');
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => setMode(t.dataset.mode));
    t.addEventListener('keydown', (e) => {
      const k = e.key;
      let j = -1;
      if (k === 'ArrowRight' || k === 'ArrowDown') j = (i + 1) % tabs.length;
      else if (k === 'ArrowLeft' || k === 'ArrowUp') j = (i - 1 + tabs.length) % tabs.length;
      else if (k === 'Home') j = 0;
      else if (k === 'End') j = tabs.length - 1;
      if (j < 0) return;
      e.preventDefault();
      setMode(tabs[j].dataset.mode, { focus: true });
    });
  });
}

/* ---------- practice by topic ---------- */
const practice = { lesson: '', at: 0, list: [] };
function practiceFilters() {
  const f = $('[data-practice-filters]');
  const fd = new FormData(f);
  return {
    q: String(fd.get('q') || '').trim().toLowerCase(),
    module: String(fd.get('module') || ''),
    type: String(fd.get('type') || ''),
    level: String(fd.get('level') || ''),
    view: $('input[name="view"]:checked')?.value || 'one',
  };
}
function syncPracticeUrl() {
  if (currentMode !== 'practice') return;
  const s = practiceFilters();
  const p = new URLSearchParams();
  if (practice.lesson) p.set('lesson', practice.lesson);
  else if (s.module) p.set('module', s.module);
  if (s.type) p.set('type', s.type);
  if (s.level) p.set('level', s.level);
  if (s.q) p.set('q', s.q);
  if (s.view === 'list') p.set('view', 'list');
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}
function renderPractice({ keepPosition = false } = {}) {
  const s = practiceFilters();
  const terms = s.q.split(/\s+/).filter(Boolean);
  const list = DATA.questions.filter((q) =>
    (!practice.lesson || `${q.module}/${q.lesson}` === practice.lesson) &&
    (!s.module || q.module === s.module) &&
    (!s.type || q.type === s.type) &&
    (!s.level || q.level === s.level) &&
    terms.every((t) => `${q.text} ${q.lessonTitle} ${q.moduleTitle}`.toLowerCase().includes(t)),
  );
  practice.list = list;
  if (!keepPosition) practice.at = 0;
  practice.at = Math.min(practice.at, Math.max(0, list.length - 1));

  const filtered = Boolean(practice.lesson || s.module || s.type || s.level || s.q);
  $('[data-practice-count]').textContent = filtered ? `${plural(list.length, 'question')} match` : `All ${DATA.questions.length} questions`;
  $('[data-practice-clear]').hidden = !filtered;
  const chip = $('[data-lesson-chip]');
  const lesson = practice.lesson && DATA.modules.flatMap((m) => m.lessons).find((l) => l.key === practice.lesson);
  chip.hidden = !lesson;
  if (lesson) {
    chip.replaceChildren(
      h('span', {}, 'Lesson: ', h('a', { href: lesson.url }, lesson.title)),
      h('button', { type: 'button', 'aria-label': 'Remove lesson filter', onclick: () => { practice.lesson = ''; renderPractice(); syncPracticeUrl(); } }, '×'),
    );
  }

  const out = $('[data-practice-out]');
  if (!list.length) {
    out.replaceChildren(
      h('div', { class: 'card l-empty' },
        h('p', { class: 'l-empty-title' }, 'No questions match'),
        h('p', { class: 'muted' }, 'Try another level or type, or clear the search.'),
        h('button', { type: 'button', class: 'btn secondary', onclick: clearPractice }, 'Clear filters'),
      ),
    );
    return;
  }
  if (s.view === 'list') {
    out.replaceChildren(h('ol', { class: 'iv-list' }, list.map((q) => h('li', {}, questionCard(q)))));
    return;
  }
  const q = list[practice.at];
  const prevBtn = h('button', { type: 'button', class: 'btn secondary', disabled: practice.at === 0, onclick: () => go(-1) }, '← Previous');
  const nextBtn = h('button', { type: 'button', class: 'btn', disabled: practice.at >= list.length - 1, onclick: () => go(1) }, 'Next question →');
  out.replaceChildren(
    questionCard(q, { index: practice.at, total: list.length }),
    h('nav', { class: 'iv-pager', 'aria-label': 'Question navigation' }, prevBtn, h('span', { class: 'faint' }, `${practice.at + 1} / ${list.length}`), nextBtn),
  );
  function go(d) {
    practice.at += d;
    renderPractice({ keepPosition: true });
    $('.iv-q-title', out)?.focus();
  }
}
function clearPractice() {
  $('[data-practice-filters]').reset();
  practice.lesson = '';
  renderPractice();
  syncPracticeUrl();
}
function initPractice(params) {
  const f = $('[data-practice-filters]');
  const lesson = params.get('lesson') || '';
  const module = params.get('module') || '';
  if (lesson) {
    const key = lesson.includes('/') ? lesson : module ? `${module}/${lesson}` : DATA.modules.flatMap((m) => m.lessons).find((l) => l.slug === lesson)?.key || '';
    if (DATA.modules.some((m) => m.lessons.some((l) => l.key === key))) practice.lesson = key;
  }
  if (module && !practice.lesson && f.elements.module.querySelector(`option[value="${CSS.escape(module)}"]`)) f.elements.module.value = module;
  for (const k of ['type', 'level']) {
    const v = params.get(k);
    const r = v && f.querySelector(`input[name="${k}"][value="${CSS.escape(v)}"]`);
    if (r) r.checked = true;
  }
  if (params.get('q')) f.elements.q.value = params.get('q');
  if (params.get('view') === 'list') $('input[name="view"][value="list"]').checked = true;
  const onChange = (e) => {
    if (e.target.name === 'module' && practice.lesson) practice.lesson = '';
    renderPractice();
    syncPracticeUrl();
  };
  f.addEventListener('input', onChange);
  $$('input[name="view"]').forEach((r) => r.addEventListener('change', () => { renderPractice({ keepPosition: true }); syncPracticeUrl(); }));
  $('[data-practice-clear]').addEventListener('click', clearPractice);
  renderPractice();
}

/* ---------- mock interview ---------- */
const mock = { qs: [], at: 0, states: [], timerId: 0, deadline: 0, started: 0 };
function mockConfig() {
  const f = $('[data-mock-setup]');
  return {
    modules: $$('input[name="modules"]:checked', f).map((i) => i.value),
    level: $('input[name="mlevel"]:checked', f)?.value || '',
    count: Number($('input[name="count"]:checked', f)?.value || 10),
    timer: Number($('input[name="timer"]:checked', f)?.value || 0),
  };
}
function mockPool(c) {
  return DATA.questions.filter((q) => c.modules.includes(q.module) && (!c.level || q.level === c.level));
}
function paintPool() {
  const c = mockConfig();
  const n = mockPool(c).length;
  const btn = $('[data-mock-start]');
  btn.disabled = n === 0;
  $('[data-mock-pool]').textContent = !c.modules.length
    ? 'Pick at least one topic.'
    : n === 0
      ? 'No questions for that combination. Try "Mixed" level.'
      : n < c.count
        ? `Only ${plural(n, 'question')} available, so you'll get all of them.`
        : `${n} questions available. You'll get ${c.count} at random.`;
}
function startMock() {
  const c = mockConfig();
  const pool = shuffle(mockPool(c));
  if (!pool.length) return;
  // Keep a mix of types where possible: interleave by type.
  const byType = { mcq: [], open: [], design: [] };
  pool.forEach((q) => byType[q.type].push(q));
  const picked = [];
  const order = ['mcq', 'open', 'mcq', 'design'];
  for (let i = 0; picked.length < Math.min(c.count, pool.length); i++) {
    const t = order[i % order.length];
    const q = byType[t].shift() || byType.mcq.shift() || byType.open.shift() || byType.design.shift();
    if (q) picked.push(q);
  }
  mock.qs = picked;
  mock.states = picked.map(() => null);
  mock.at = 0;
  mock.started = Date.now();
  mock.deadline = c.timer ? Date.now() + c.timer * 60000 : 0;
  $('[data-mock-setup]').hidden = true;
  clearInterval(mock.timerId);
  if (mock.deadline) mock.timerId = setInterval(tickTimer, 1000);
  renderMockQuestion();
}
function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function tickTimer() {
  const left = mock.deadline - Date.now();
  const el = $('[data-mock-timer]');
  if (el) {
    el.textContent = `${fmtTime(left)} left`;
    el.classList.toggle('is-low', left < 120000);
  }
  if (left <= 0) finishMock(true);
}
function renderMockQuestion() {
  const out = $('[data-mock-out]');
  const total = mock.qs.length;
  const q = mock.qs[mock.at];
  const last = mock.at === total - 1;
  const answered = () => {
    const st = mock.states[mock.at];
    return st && (q.type === 'mcq' ? st.choice != null : st.rating != null);
  };
  const nextBtn = h('button', { type: 'button', class: 'btn', onclick: next }, last ? 'Finish and see results' : 'Next question →');
  const hint = h('p', { class: 'faint iv-next-hint', 'aria-live': 'polite' });
  const refresh = () => {
    const ok = answered();
    nextBtn.disabled = !ok;
    hint.textContent = ok ? '' : q.type === 'mcq' ? 'Pick an answer to continue (or skip).' : 'Reveal the key points and rate yourself to continue (or skip).';
  };
  const bar = h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Interview progress', 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('span'));
  setBar(bar, (mock.at / total) * 100);
  const top = h('div', { class: 'mock-bar card' },
    h('div', { class: 'mock-bar-row' },
      h('strong', {}, `Question ${mock.at + 1} of ${total}`),
      mock.deadline ? h('span', { class: 'mock-timer', role: 'timer', 'data-mock-timer': '' }, `${fmtTime(mock.deadline - Date.now())} left`) : h('span', { class: 'faint' }, 'No timer'),
      h('button', { type: 'button', class: 'l-textbtn', onclick: () => { if (confirmEnd()) finishMock(false); } }, 'End interview'),
    ),
    bar,
  );
  const card = questionCard(q, { mode: 'mock', onChange: (st) => { mock.states[mock.at] = { ...st }; refresh(); } });
  const nav = h('div', { class: 'iv-pager mock-nav' },
    h('button', { type: 'button', class: 'l-textbtn', onclick: skip }, last ? 'Skip and finish' : 'Skip this one'),
    h('div', { class: 'mock-nav-main' }, hint, nextBtn),
  );
  out.replaceChildren(top, card, nav);
  refresh();
  $('.iv-q-title', out)?.focus();
  function next() {
    if (!answered()) return;
    advance();
  }
  function skip() {
    mock.states[mock.at] = { id: q.id, choice: null, rating: null, score: 0, skipped: true };
    advance();
  }
  function advance() {
    if (mock.at >= total - 1) finishMock(false);
    else {
      mock.at++;
      renderMockQuestion();
    }
  }
}
function confirmEnd() {
  const done = mock.states.filter(Boolean).length;
  return done === mock.qs.length || window.confirm(`End now? ${mock.qs.length - done} unanswered question(s) will count as missed.`);
}
function finishMock(timeUp) {
  clearInterval(mock.timerId);
  const rows = mock.qs.map((q, i) => {
    const st = mock.states[i] || { score: 0, skipped: true };
    const score = Number(st.score) || 0;
    if (!st.skipped) recordAnswer(q.id, score);
    else recordAnswer(q.id, 0);
    return { q, st, score };
  });
  paintStats();
  const total = rows.reduce((n, r) => n + r.score, 0);
  const pct = Math.round((total / rows.length) * 100);
  const mcqs = rows.filter((r) => r.q.type === 'mcq');
  const opens = rows.filter((r) => r.q.type !== 'mcq');

  // Per module
  const perMod = new Map();
  rows.forEach((r) => {
    const m = perMod.get(r.q.module) || { title: r.q.moduleTitle, short: r.q.moduleShort, n: 0, s: 0 };
    m.n++;
    m.s += r.score;
    perMod.set(r.q.module, m);
  });
  // Weak lessons: anything not fully right
  const weak = new Map();
  rows.filter((r) => r.score < 1).forEach((r) => weak.set(r.q.lessonUrl, { title: r.q.lessonTitle, module: r.q.moduleShort }));

  const verdict = pct >= 80 ? 'Strong result. You\'re interview-ready on these topics.' : pct >= 50 ? 'Solid base. Review the lessons below to close the gaps.' : 'Good practice. Start with the lessons below, then try again.';
  const out = $('[data-mock-out]');
  const modRows = [...perMod.values()].sort((a, b) => a.s / a.n - b.s / b.n).map((m) => {
    const p = Math.round((m.s / m.n) * 100);
    const bar = h('div', { class: 'progress', role: 'progressbar', 'aria-label': `${m.title} score`, 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('span'));
    setBar(bar, p);
    return h('li', { class: 'sum-mod' }, h('div', { class: 'progress-label' }, h('span', {}, m.title), h('span', {}, `${p}% · ${plural(m.n, 'question')}`)), bar);
  });

  const review = rows.map((r, i) => {
    const q = r.q;
    let status;
    if (r.st.skipped) status = h('span', { class: 'tag tag-warn' }, 'Skipped');
    else if (q.type === 'mcq') status = h('span', { class: `tag ${r.score ? 'tag-accent' : 'tag-danger'}` }, r.score ? 'Correct' : 'Wrong');
    else status = h('span', { class: `tag ${r.score >= 1 ? 'tag-accent' : r.score > 0 ? 'tag-warn' : 'tag-danger'}` }, RATINGS.find((x) => x.score === r.score)?.label || 'Missed it');
    const body = h('div', { class: 'sum-review-body' });
    if (q.type === 'mcq') {
      body.append(
        h('ul', { class: 'quiz-options' }, q.options.map((o, j) => h('li', {}, h('div', {
          class: `quiz-option ${j === q.answer ? 'is-correct' : ''} ${j === r.st.choice && j !== q.answer ? 'is-wrong' : ''}`,
          html: o + (j === r.st.choice ? ' <span class="faint">(your answer)</span>' : ''),
        })))),
        h('div', { class: 'iv-expl', html: q.explanation }),
      );
    } else {
      body.append(h('div', { class: 'iv-model-body', html: q.modelAnswer }));
    }
    body.append(h('p', { class: 'iv-q-foot' }, h('a', { href: q.lessonUrl }, `Lesson: ${q.lessonTitle} →`)));
    return h('li', {}, h('details', { class: 'sum-review' },
      h('summary', {}, h('span', { class: 'sum-review-n' }, `${i + 1}.`), h('span', { class: 'sum-review-q', html: q.question }), status),
      body,
    ));
  });

  out.replaceChildren(
    h('section', { class: 'card sum', 'aria-labelledby': 'sum-h' },
      timeUp ? h('p', { class: 'callout warning' }, h('strong', {}, 'Time\'s up. '), 'Unanswered questions count as missed.') : null,
      h('div', { class: 'sum-top' },
        h('div', { class: 'sum-score', 'aria-hidden': 'true', style: `--p:${pct}` }, h('span', {}, `${pct}%`)),
        h('div', {},
          h('h2', { id: 'sum-h', class: 'l-h2', tabindex: '-1' }, 'Your interview results'),
          h('p', { class: 'muted' }, verdict),
          h('p', { class: 'faint' },
            `${mcqs.filter((r) => r.score === 1).length} of ${mcqs.length} multiple-choice correct · `,
            `${opens.filter((r) => r.score === 1).length} of ${opens.length} open questions nailed · `,
            `took ${fmtTime(Date.now() - mock.started)}`),
        ),
      ),
      h('div', { class: 'sum-cols' },
        h('div', {}, h('h3', { class: 'iv-sub' }, 'Score by module'), h('ul', { class: 'sum-mods' }, modRows)),
        h('div', {},
          h('h3', { class: 'iv-sub' }, 'Topics to review'),
          weak.size
            ? h('ul', { class: 'sum-weak' }, [...weak].map(([url, w]) => h('li', {}, h('a', { href: url }, w.title), h('span', { class: 'faint' }, ` · ${w.module}`))))
            : h('p', { class: 'muted' }, 'Nothing to review. Every answer was spot on.'),
        ),
      ),
      h('div', { class: 'l-actions' },
        h('button', { type: 'button', class: 'btn', onclick: resetMock }, 'Start another mock'),
        weak.size ? h('button', { type: 'button', class: 'btn secondary', onclick: () => setMode('review', { focus: true }) }, 'Go to Review later') : null,
      ),
    ),
    h('section', { class: 'sum-answers', 'aria-labelledby': 'sum-a' }, h('h3', { id: 'sum-a', class: 'iv-sub' }, 'Question by question'), h('ol', { class: 'sum-review-list' }, review)),
  );
  $('#sum-h')?.focus();
}
function resetMock() {
  clearInterval(mock.timerId);
  $('[data-mock-out]').replaceChildren();
  $('[data-mock-setup]').hidden = false;
  paintPool();
  $('[data-mock-start]').focus();
}
function initMock() {
  const f = $('[data-mock-setup]');
  f.addEventListener('change', paintPool);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    startMock();
  });
  $$('[data-mods]', f).forEach((b) =>
    b.addEventListener('click', () => {
      $$('input[name="modules"]', f).forEach((i) => (i.checked = b.dataset.mods === 'all'));
      paintPool();
    }),
  );
  paintPool();
}

/* ---------- review later ---------- */
function renderReview() {
  const out = $('[data-review-out]');
  if (!out) return;
  const answers = getAnswers();
  const saved = getBookmarks().filter((id) => byId.has(id));
  const missed = Object.entries(answers).filter(([id, v]) => byId.has(id) && Number(v.score) < 1 && !saved.includes(id)).sort((a, b) => b[1].at - a[1].at).map(([id]) => id);
  if (!saved.length && !missed.length) {
    out.replaceChildren(
      h('div', { class: 'card l-empty l-empty-big' },
        h('p', { class: 'l-empty-title' }, 'Nothing to review yet'),
        h('p', { class: 'muted' }, 'Press "Save" on any question to keep it here. Questions you get wrong, or rate as "Missed it" or "Partly", show up here automatically.'),
        h('button', { type: 'button', class: 'btn', onclick: () => setMode('practice', { focus: true }) }, 'Start practising'),
      ),
    );
    return;
  }
  const group = (title, ids, note) =>
    ids.length
      ? h('section', { class: 'rv-group' },
          h('h2', { class: 'l-h2' }, `${title} `, h('span', { class: 'faint' }, `(${ids.length})`)),
          h('p', { class: 'muted' }, note),
          h('ol', { class: 'iv-list' }, ids.map((id) => h('li', {}, questionCard(byId.get(id))))),
        )
      : null;
  out.replaceChildren(
    group('Saved for later', saved, 'Questions you bookmarked. Press "Saved" to remove one.'),
    group('Needs another look', missed, 'Questions you got wrong or only partly covered, newest first. Get them right to clear them.'),
  );
}

/* ---------- boot ---------- */
export async function initInterview() {
  try {
    const res = await fetch('/interview/questions.json');
    if (!res.ok) throw new Error(String(res.status));
    DATA = await res.json();
  } catch {
    const out = $('[data-practice-out]');
    if (out) out.replaceChildren(h('div', { class: 'card l-empty' }, h('p', { class: 'l-empty-title' }, 'Questions could not be loaded'), h('p', { class: 'muted' }, 'Check your connection and reload the page.')));
    $('[data-practice-count]').textContent = '';
    return;
  }
  byId = new Map(DATA.questions.map((q) => [q.id, q]));
  const params = new URLSearchParams(location.search);
  initTabs();
  initPractice(params);
  initMock();
  paintStats();
  const mode = params.get('mode');
  if (mode === 'mock' || mode === 'review') setMode(mode, { push: false });
  if (mode === 'mock' && params.get('module')) {
    // ?mode=mock&module=04-rag pre-selects that topic.
    $$('input[name="modules"]').forEach((i) => (i.checked = i.value === params.get('module')));
    paintPool();
  }
}
