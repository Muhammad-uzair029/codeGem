// Per-viewer progress for Learn + Interview prep, kept in localStorage under
// a `codegem:` prefix. Every access is wrapped so pages still work when
// storage is blocked (private mode, previews): reads fall back to defaults
// and writes are silently dropped.
const P = 'codegem:';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(P + key);
    if (raw == null) return fallback;
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(P + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ---------- Lessons ---------- */
/** @returns {Record<string, number>} lesson key ("04-rag/01-rag-pipeline") -> done timestamp */
export const getDone = () => {
  const v = read('done', {});
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
};
export const isDone = (key) => Boolean(getDone()[key]);
export function setDone(key, done) {
  const d = getDone();
  if (done) d[key] = Date.now();
  else delete d[key];
  write('done', d);
  markActive();
  return d;
}
/** Last lesson opened: { key, at } */
export const getLast = () => read('last', null);
export const setLast = (key) => write('last', { key, at: Date.now() });

/* ---------- Questions ---------- */
/**
 * id -> { score: 0 | 0.5 | 1, at } where mcq right = 1, wrong = 0 and open
 * questions use the self-rating (missed 0, partial 0.5, nailed 1).
 */
export const getAnswers = () => {
  const v = read('answers', {});
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
};
export function recordAnswer(id, score) {
  const a = getAnswers();
  a[id] = { score, at: Date.now() };
  write('answers', a);
  markActive();
}
export const getBookmarks = () => {
  const v = read('bookmarks', []);
  return Array.isArray(v) ? v : [];
};
export function toggleBookmark(id) {
  const b = new Set(getBookmarks());
  if (b.has(id)) b.delete(id);
  else b.add(id);
  write('bookmarks', [...b]);
  return b.has(id);
}

/* ---------- Activity streak ---------- */
function markActive() {
  const days = read('days', []);
  const list = Array.isArray(days) ? days : [];
  const t = today();
  if (!list.includes(t)) {
    list.push(t);
    write('days', list.slice(-400));
  }
}
/** Consecutive days with activity, ending today (or yesterday). */
export function streak() {
  const days = new Set(read('days', []));
  const d = new Date();
  const key = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (!days.has(key(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(key(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/* ---------- Progress UI helpers ---------- */
/** Sets a .progress bar (role="progressbar") to pct. */
export function setBar(el, pct) {
  if (!el) return;
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  el.setAttribute('aria-valuenow', String(v));
  const fill = el.querySelector('span');
  if (fill) fill.style.setProperty('--v', `${v}%`);
}

/**
 * Updates every progress widget on the page from storage:
 *  [data-lesson-done="key"]           gets .is-done + the check's label
 *  [data-module-progress="slug"]      container with data-keys="k1 k2 ..."
 *     .progress, [data-count], [data-state] inside it
 */
export function paintProgress(root = document) {
  const done = getDone();
  root.querySelectorAll('[data-lesson-done]').forEach((el) => {
    const on = Boolean(done[el.dataset.lessonDone]);
    el.classList.toggle('is-done', on);
    const sr = el.querySelector('[data-done-label]');
    if (sr) sr.textContent = on ? 'Done' : 'Not done yet';
  });
  root.querySelectorAll('[data-module-progress]').forEach((el) => {
    const keys = (el.dataset.keys || '').split(' ').filter(Boolean);
    const n = keys.filter((k) => done[k]).length;
    const pct = keys.length ? (n / keys.length) * 100 : 0;
    setBar(el.querySelector('.progress'), pct);
    el.querySelectorAll('[data-count]').forEach((c) => (c.textContent = `${n} of ${keys.length} done`));
    const state = n === 0 ? 'todo' : n === keys.length ? 'done' : 'doing';
    el.dataset.state = state;
    el.querySelectorAll('[data-state-label]').forEach((s) => (s.textContent = { todo: 'Not started', doing: 'In progress', done: 'Done' }[state]));
  });
}
