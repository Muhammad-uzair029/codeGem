// Validates content/learn + content/practice against CONTENT_FORMAT.md.
// Usage: node scripts/validate-content.mjs  (exits 1 on any error)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'content');
const SLUG = /^\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/;
const HEADINGS = ['Core concepts', 'How it works in real systems', 'Common mistakes', 'Interview angle'];
const ICONS = ['brain', 'prompt', 'vector', 'rag', 'agent', 'eval', 'server', 'shield', 'design', 'team'];

const mcqCheck = z.object({
  q: z.string().min(5),
  options: z.array(z.string().min(1)).min(2).max(6),
  answer: z.number().int().min(0),
  why: z.string().min(5),
});
const moduleSchema = z.object({
  title: z.string().min(3),
  summary: z.string().min(10),
  icon: z.enum(ICONS),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
});
const lessonSchema = z.object({
  title: z.string().min(3),
  summary: z.string().min(10),
  minutes: z.number().int().min(2).max(40),
  practice: z.array(z.string()).min(1),
  flow: z
    .object({
      title: z.string().min(3),
      steps: z.array(z.object({ label: z.string().min(1), detail: z.string().min(5) })).min(2).max(9),
      loop: z.object({ from: z.number().int().min(1), to: z.number().int().min(1), label: z.string() }).optional(),
    })
    .optional(),
  selfCheck: z.array(mcqCheck).min(2).max(4),
});
const question = z.discriminatedUnion('type', [
  z.object({
    id: z.string(), lesson: z.string(), type: z.literal('mcq'),
    level: z.enum(['junior', 'mid', 'senior']), question: z.string().min(10),
    options: z.array(z.string().min(1)).min(2).max(6), answer: z.number().int().min(0),
    explanation: z.string().min(10),
  }),
  ...['open', 'design'].map((t) =>
    z.object({
      id: z.string(), lesson: z.string(), type: z.literal(t),
      level: z.enum(['junior', 'mid', 'senior']), question: z.string().min(10),
      keyPoints: z.array(z.string().min(3)).min(3).max(8), modelAnswer: z.string().min(40),
      followUps: z.array(z.string()).optional(),
    }),
  ),
]);
const practiceSchema = z.object({ module: z.string(), questions: z.array(question).min(1) });

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const zodErr = (where, r) => r.error.issues.forEach((i) => err(where, `${i.path.join('.') || '(root)'} ${i.message}`));

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  return m ? { data: parse(m[1]), body: m[2] } : null;
}

const learnDir = join(root, 'learn');
const practiceDir = join(root, 'practice');
const allIds = new Map();
let lessonCount = 0;
let questionCount = 0;

const modules = existsSync(learnDir) ? readdirSync(learnDir).filter((d) => statSync(join(learnDir, d)).isDirectory()).sort() : [];
for (const mod of modules) {
  const where = `learn/${mod}`;
  if (!SLUG.test(mod)) err(where, 'folder name must be NN-kebab-slug');
  const modFile = join(learnDir, mod, 'module.yaml');
  if (!existsSync(modFile)) { err(where, 'missing module.yaml'); continue; }
  try { const r = moduleSchema.safeParse(parse(readFileSync(modFile, 'utf8'))); if (!r.success) zodErr(`${where}/module.yaml`, r); }
  catch (e) { err(`${where}/module.yaml`, `YAML: ${e.message}`); }

  const lessonDir = join(learnDir, mod, 'lessons');
  const lessons = existsSync(lessonDir) ? readdirSync(lessonDir).filter((f) => f.endsWith('.md')).sort() : [];
  if (lessons.length === 0) err(where, 'no lessons');
  const lessonPractice = new Map();
  for (const f of lessons) {
    const lw = `${where}/lessons/${f}`;
    const slug = f.replace(/\.md$/, '');
    if (!SLUG.test(slug)) err(lw, 'file name must be NN-kebab-slug.md');
    let fm;
    try { fm = frontmatter(readFileSync(join(lessonDir, f), 'utf8')); } catch (e) { err(lw, `YAML: ${e.message}`); continue; }
    if (!fm) { err(lw, 'missing --- frontmatter ---'); continue; }
    const r = lessonSchema.safeParse(fm.data);
    if (!r.success) { zodErr(lw, r); continue; }
    lessonCount++;
    const d = r.data;
    d.selfCheck.forEach((c, i) => { if (c.answer >= c.options.length) err(lw, `selfCheck.${i}.answer out of range`); });
    if (d.flow?.loop) {
      const n = d.flow.steps.length;
      if (d.flow.loop.from > n || d.flow.loop.to > n) err(lw, 'flow.loop index out of range');
    }
    const found = [...fm.body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
    const order = found.filter((h) => HEADINGS.includes(h));
    if (order.join('|') !== HEADINGS.join('|')) err(lw, `body needs these ## headings in order: ${HEADINGS.join(' → ')} (found: ${found.join(', ') || 'none'})`);
    lessonPractice.set(slug, d.practice);
  }

  const pFile = join(practiceDir, `${mod}.yaml`);
  if (!existsSync(pFile)) { err(where, `missing practice/${mod}.yaml`); continue; }
  let p;
  try { p = practiceSchema.safeParse(parse(readFileSync(pFile, 'utf8'))); } catch (e) { err(`practice/${mod}.yaml`, `YAML: ${e.message}`); continue; }
  if (!p.success) { zodErr(`practice/${mod}.yaml`, p); continue; }
  if (p.data.module !== mod) err(`practice/${mod}.yaml`, `module must be "${mod}"`);
  const linked = new Map();
  for (const q of p.data.questions) {
    questionCount++;
    const qw = `practice/${mod}.yaml#${q.id}`;
    if (allIds.has(q.id)) err(qw, `duplicate id (also in ${allIds.get(q.id)})`);
    allIds.set(q.id, mod);
    if (!lessonPractice.has(q.lesson)) err(qw, `lesson "${q.lesson}" not found in this module`);
    if (q.type === 'mcq' && q.answer >= q.options.length) err(qw, 'answer out of range');
    linked.set(q.lesson, (linked.get(q.lesson) ?? 0) + 1);
  }
  const ids = new Set(p.data.questions.map((q) => q.id));
  for (const [slug, refs] of lessonPractice) {
    for (const id of refs) if (!ids.has(id)) err(`${where}/lessons/${slug}.md`, `practice id "${id}" not in practice/${mod}.yaml`);
    if ((linked.get(slug) ?? 0) < 2) err(`${where}/lessons/${slug}.md`, 'needs ≥ 2 practice questions pointing at it');
  }
}

if (errors.length) {
  console.error(`Content invalid — ${errors.length} problem(s):\n` + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`Content OK: ${modules.length} modules, ${lessonCount} lessons, ${questionCount} practice questions.`);
