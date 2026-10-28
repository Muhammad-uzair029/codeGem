// Picks the lesson to suggest next.
// all: lessons in course order ({ key, ... }); done: key -> timestamp.
// Resume the last opened lesson if it isn't done; otherwise the first
// unfinished lesson after it, wrapping round to the start.
export function nextLesson(all, done, lastKey) {
  if (!all.length) return null;
  const at = all.findIndex((l) => l.key === lastKey);
  if (at >= 0 && !done[all[at].key]) return { lesson: all[at], resume: true };
  const order = at >= 0 ? [...all.slice(at + 1), ...all.slice(0, at)] : all;
  const next = order.find((l) => !done[l.key]);
  return next ? { lesson: next, resume: false } : null;
}
