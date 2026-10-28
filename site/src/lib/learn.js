// Build-time loader for content/learn, content/practice and content/courses.yaml.
// Everything here runs in Node during `astro build`; nothing ships to the browser
// except what pages choose to serialise.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { SITE_DIR } from '../../lib/skills.mjs';
import { renderLesson, renderMd, renderInlineMd } from './learn-markdown.js';

const CONTENT = path.join(SITE_DIR, 'content');
const LEARN = path.join(CONTENT, 'learn');
const PRACTICE = path.join(CONTENT, 'practice');
const COURSES = path.join(CONTENT, 'courses.yaml');

const LEVEL_ORDER = ['beginner', 'intermediate', 'advanced'];
/** Short labels for the learning path and filters. */
const SHORT = {
  'llm-foundations': 'Foundations',
  'prompt-engineering': 'Prompts',
  'embeddings-vector-search': 'Embeddings',
  rag: 'RAG',
  'agents-tool-calling': 'Agents',
  'evaluation-observability': 'Evals',
  'production-ai-architecture': 'Production',
  'ai-security-compliance': 'Security',
  'ai-system-design': 'System design',
  'leading-ai-teams': 'Leading teams',
};

const read = (f) => fs.readFileSync(f, 'utf8');
const dirs = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((x) => fs.statSync(path.join(d, x)).isDirectory()).sort() : []);
/** "04-rag" -> "rag" */
export const bareSlug = (s) => s.replace(/^\d{2}-/, '');

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('missing frontmatter');
  return { data: parse(m[1]), body: m[2] };
}

let cache;
/** All modules with their lessons, in order. Cached for the whole build. */
export function getModules() {
  if (cache) return cache;
  cache = dirs(LEARN).map((slug, mi) => {
    const meta = parse(read(path.join(LEARN, slug, 'module.yaml')));
    const lessonDir = path.join(LEARN, slug, 'lessons');
    const files = fs.readdirSync(lessonDir).filter((f) => f.endsWith('.md')).sort();
    const lessons = files.map((f, li) => {
      const lslug = f.replace(/\.md$/, '');
      const { data, body } = frontmatter(read(path.join(lessonDir, f)));
      return {
        slug: lslug,
        module: slug,
        index: li,
        key: `${slug}/${lslug}`,
        url: `/learn/${slug}/${lslug}/`,
        title: data.title,
        summary: data.summary,
        minutes: data.minutes,
        practice: data.practice || [],
        flow: data.flow || null,
        selfCheck: (data.selfCheck || []).map((c) => ({ ...c, qHtml: renderInlineMd(c.q), whyHtml: renderInlineMd(c.why), optionsHtml: c.options.map(renderInlineMd) })),
        body,
      };
    });
    return {
      slug,
      bare: bareSlug(slug),
      index: mi,
      num: slug.slice(0, 2),
      url: `/learn/${slug}/`,
      title: meta.title,
      short: SHORT[bareSlug(slug)] || meta.title,
      summary: meta.summary,
      icon: meta.icon,
      level: meta.level,
      levelRank: LEVEL_ORDER.indexOf(meta.level),
      lessons,
      minutes: lessons.reduce((n, l) => n + (l.minutes || 0), 0),
    };
  });
  return cache;
}

/** Lesson body split into its four sections, rendered to HTML. */
export function lessonSections(lesson) {
  return renderLesson(lesson.body);
}

/** Compact module/lesson index for client scripts (progress everywhere). */
export function progressIndex() {
  return getModules().map((m) => ({
    slug: m.slug,
    title: m.title,
    url: m.url,
    lessons: m.lessons.map((l) => ({ key: l.key, title: l.title, url: l.url, minutes: l.minutes })),
  }));
}

/** All practice questions, with markdown rendered, in module/lesson order. */
export function getQuestions() {
  const mods = getModules();
  const out = [];
  for (const m of mods) {
    const file = path.join(PRACTICE, `${m.slug}.yaml`);
    if (!fs.existsSync(file)) continue;
    const data = parse(read(file));
    for (const q of data.questions || []) {
      const lesson = m.lessons.find((l) => l.slug === q.lesson);
      const base = {
        id: q.id,
        module: m.slug,
        moduleTitle: m.title,
        moduleShort: m.short,
        lesson: q.lesson,
        lessonTitle: lesson ? lesson.title : q.lesson,
        lessonUrl: lesson ? lesson.url : m.url,
        type: q.type,
        level: q.level,
        question: renderInlineMd(q.question),
        text: q.question, // plain, for search
      };
      if (q.type === 'mcq') {
        out.push({ ...base, options: q.options.map(renderInlineMd), answer: q.answer, explanation: renderMd(q.explanation) });
      } else {
        out.push({
          ...base,
          keyPoints: q.keyPoints.map(renderInlineMd),
          modelAnswer: renderMd(q.modelAnswer),
          followUps: (q.followUps || []).map(renderInlineMd),
        });
      }
    }
  }
  return out;
}

/**
 * The course catalog, or null when the file is missing or invalid (the
 * Courses page then shows a friendly "coming soon" state). Invalid files log
 * a build warning instead of failing, since courses are optional content.
 */
export function getCourses() {
  if (!fs.existsSync(COURSES)) return null;
  let data;
  try {
    data = parse(read(COURSES));
  } catch (e) {
    console.warn(`[courses] content/courses.yaml is not valid YAML: ${e.message}`);
    return null;
  }
  const problems = [];
  if (!data || !Array.isArray(data.providers)) {
    console.warn('[courses] content/courses.yaml has no providers list');
    return null;
  }
  const bares = new Set(getModules().map((m) => m.bare));
  const providers = [];
  for (const [pi, p] of data.providers.entries()) {
    if (!p || !p.name || !Array.isArray(p.courses)) { problems.push(`providers[${pi}] needs name and courses`); continue; }
    const courses = [];
    for (const [ci, c] of p.courses.entries()) {
      if (!c || !c.title || !/^https?:\/\//.test(c.url || '')) { problems.push(`${p.name} course ${ci} needs title and an http(s) url`); continue; }
      const modules = (c.modules || []).filter((s) => {
        if (bares.has(s)) return true;
        problems.push(`${p.name} / ${c.title}: unknown module "${s}"`);
        return false;
      });
      courses.push({
        title: String(c.title),
        url: String(c.url),
        summary: c.summary ? String(c.summary) : '',
        level: c.level ? String(c.level) : '',
        format: c.format ? String(c.format) : '',
        free: c.free === true,
        tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
        modules,
      });
    }
    if (courses.length) providers.push({ id: String(p.id || p.name), name: String(p.name), url: p.url ? String(p.url) : '', featured: p.featured === true, courses });
  }
  for (const msg of problems) console.warn(`[courses] ${msg}`);
  if (!providers.length) return null;
  // Featured (Anthropic) first, then the rest in file order.
  providers.sort((a, b) => Number(b.featured) - Number(a.featured));
  const updated = data.updated instanceof Date ? data.updated.toISOString().slice(0, 10) : data.updated ? String(data.updated) : '';
  return { updated, providers };
}

/** Courses related to a module, featured providers first. */
export function coursesForModule(courses, moduleSlug) {
  if (!courses) return [];
  const bare = bareSlug(moduleSlug);
  return courses.providers.flatMap((p) => p.courses.filter((c) => c.modules.includes(bare)).map((c) => ({ ...c, provider: p.name, featured: p.featured })));
}

export const LEVEL_LABEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
