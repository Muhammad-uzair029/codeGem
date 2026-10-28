// /interview/questions.json — every practice question, generated at build time
// with markdown already rendered to HTML (escaped; raw HTML is never passed through).
import { getModules, getQuestions } from '../../lib/learn.js';

export function GET() {
  const modules = getModules().map((m) => ({
    slug: m.slug,
    title: m.title,
    short: m.short,
    url: m.url,
    lessons: m.lessons.map((l) => ({ slug: l.slug, key: l.key, title: l.title, url: l.url })),
  }));
  return new Response(JSON.stringify({ modules, questions: getQuestions() }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
