// Reads ../.claude/skills/ and site/skills-meta.json and builds the skill
// manifest used by the pages, the installers and dist/manifest.json.
// Everything here is plain Node so it can run inside Astro and in scripts.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

// When Astro bundles pages, import.meta.url points into dist/, so prefer the
// working directory (npm scripts always run from site/).
const here = path.dirname(fileURLToPath(import.meta.url));
export const SITE_DIR = fs.existsSync(path.join(process.cwd(), 'skills-meta.json'))
  ? process.cwd()
  : path.resolve(here, '..');
export const SKILLS_DIR = path.resolve(SITE_DIR, '..', '.claude', 'skills');
export const META_PATH = path.join(SITE_DIR, 'skills-meta.json');
export const OTHER_GROUP = { name: 'Other', blurb: 'Skills not yet sorted into a group' };
export const PLACEHOLDER_URL = 'https://SET-SITE_URL-AT-BUILD-TIME.invalid';

// Paths are passed to curl and PowerShell; keep them boring on purpose.
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]*$/;
const SAFE_PATH = /^[A-Za-z0-9_][A-Za-z0-9._\/-]*$/;

export class SkillsBuildError extends Error {
  constructor(problems) {
    super('Skills site build failed:\n  - ' + problems.join('\n  - '));
    this.name = 'SkillsBuildError';
  }
}

/**
 * GitHub repo ("owner/name") whose Releases hold the desktop app.
 * RELEASES_REPO env wins, then site.config.json, then the default.
 */
export function resolveReleasesRepo(env = process.env) {
  let fromFile = '';
  try {
    fromFile = JSON.parse(fs.readFileSync(path.join(SITE_DIR, 'site.config.json'), 'utf8')).releasesRepo || '';
  } catch {
    /* optional file */
  }
  const repo = String(env.RELEASES_REPO || fromFile || 'Muhammad-uzair029/codeGem-releases').trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new SkillsBuildError([`RELEASES_REPO / site.config.json releasesRepo must look like "owner/repo", got "${repo}".`]);
  }
  return repo;
}

/** Base URL baked into the installers. See README for the order. */
export function resolveSiteUrl(env = process.env) {
  let url = env.SITE_URL || '';
  if (!url && env.VERCEL_PROJECT_PRODUCTION_URL) url = 'https://' + env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!url && env.URL) url = env.URL; // Netlify
  if (!url) return { url: PLACEHOLDER_URL, source: 'placeholder' };
  if (!/^https?:\/\//.test(url)) url = 'https://' + url;
  return { url: url.replace(/\/+$/, ''), source: env.SITE_URL ? 'SITE_URL' : env.VERCEL_PROJECT_PRODUCTION_URL ? 'VERCEL_PROJECT_PRODUCTION_URL' : 'URL' };
}

function listFiles(root, rel = '') {
  const out = [];
  for (const ent of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue; // .DS_Store and friends
    const relPath = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...listFiles(root, relPath));
    else if (ent.isFile()) out.push(relPath);
  }
  return out.sort();
}

function parseSkillMd(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { front: {}, body: text };
  let front = {};
  try {
    front = YAML.parse(m[1]) || {};
  } catch {
    front = {};
  }
  return { front, body: text.slice(m[0].length) };
}

/** Split a frontmatter description into "what it does" and "when to use". */
function splitDescription(desc) {
  const idx = desc.search(/\bUse (when|whenever|this)\b/);
  if (idx <= 0) return { what: desc.trim(), when: '' };
  return { what: desc.slice(0, idx).trim(), when: desc.slice(idx).trim() };
}

function extractCommands(name, desc, body) {
  const cmds = [];
  const seen = new Set();
  const add = (cmd, d = '') => {
    const c = cmd.trim().replace(/\s+/g, ' ');
    if (!c || seen.has(c)) return;
    seen.add(c);
    cmds.push({ cmd: c, desc: d });
  };
  // Slash commands quoted in the description: "/feature-review <PR#>"
  const quoted = [...desc.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const slash = quoted.filter((q) => q.startsWith('/'));
  const aliases = new Set([name, ...slash.map((s) => s.slice(1).split(/\s/)[0])]);
  add('/' + name);
  for (const s of slash) if (aliases.has(s.slice(1).split(/\s/)[0])) add(s);
  // Backticked slash commands in the body that start with the skill or an alias.
  for (const m of body.matchAll(/`(\/[a-z][a-z0-9-]*(?: [^`]*)?)`/g)) {
    const word = m[1].slice(1).split(/\s/)[0];
    if (aliases.has(word) && !m[1].includes('…')) add(m[1]);
  }
  // Flag tables: | `--flag` | what it does |
  for (const m of body.matchAll(/^\|\s*`(--?[a-z][^`]*)`[^|]*\|\s*([^|\n]*)\|/gm)) {
    add(m[1], m[2].replace(/`/g, '').split(/(?<=\.)\s/)[0].trim());
  }
  // Natural-language triggers ("check mocks", "audit deps") the user can just say.
  const whenPart = splitDescription(desc).when;
  const phrases = [...whenPart.matchAll(/"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((q) => !q.startsWith('/') && q !== name && q.length < 60 && !/^\d/.test(q))
    .slice(0, 8);
  return { commands: cmds.slice(0, 14), phrases };
}

function loadMeta() {
  const raw = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  return { groups: raw.groups || [], skills: raw.skills || {} };
}

/** Resolve every dependency transitively. Cycles are fine (visited set). */
function resolveDeps(name, direct) {
  const order = [];
  const seen = new Set([name]);
  const visit = (n) => {
    for (const d of direct.get(n) || []) {
      if (seen.has(d)) continue;
      seen.add(d);
      order.push(d);
      visit(d);
    }
  };
  visit(name);
  return order;
}

/**
 * Build the manifest. Throws SkillsBuildError listing every problem found:
 * unknown deps, unknown groups, folders without SKILL.md, unsafe file names.
 */
export function buildManifest({ siteUrl } = {}) {
  const problems = [];
  const warnings = [];
  if (!fs.existsSync(SKILLS_DIR)) {
    throw new SkillsBuildError([`Skills folder not found at ${SKILLS_DIR}. The site must be built from inside the codeGem repo (root directory "site").`]);
  }
  const meta = loadMeta();
  const groupNames = new Set(meta.groups.map((g) => g.name));
  const folders = fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
  const folderSet = new Set(folders);

  for (const key of Object.keys(meta.skills)) {
    if (!folderSet.has(key)) warnings.push(`skills-meta.json lists "${key}" but there is no .claude/skills/${key}/ folder (entry ignored).`);
  }

  const direct = new Map();
  const skills = [];
  for (const name of folders) {
    const dir = path.join(SKILLS_DIR, name);
    if (!SAFE_NAME.test(name)) problems.push(`Skill folder name "${name}" must be lowercase letters, digits, ".", "_" or "-".`);
    const skillMd = path.join(dir, 'SKILL.md');
    if (!fs.existsSync(skillMd)) {
      problems.push(`.claude/skills/${name}/ has no SKILL.md, so it cannot be listed. Add one or remove the folder.`);
      continue;
    }
    const m = meta.skills[name] || {};
    const deps = Array.isArray(m.deps) ? m.deps : [];
    for (const d of deps) {
      if (!folderSet.has(d)) problems.push(`skills-meta.json: "${name}" depends on "${d}", which is not a folder in .claude/skills/.`);
      if (d === name) problems.push(`skills-meta.json: "${name}" lists itself as a dependency.`);
    }
    if (m.group && !groupNames.has(m.group)) problems.push(`skills-meta.json: "${name}" has unknown group "${m.group}". Add it to "groups" first.`);
    direct.set(name, deps.filter((d) => folderSet.has(d) && d !== name));

    const text = fs.readFileSync(skillMd, 'utf8');
    const { front, body } = parseSkillMd(text);
    const description = String(front.description || '').replace(/\s+/g, ' ').trim();
    const { what, when } = splitDescription(description);
    const extracted = extractCommands(name, description, body);

    const files = listFiles(dir).map((rel) => {
      if (!SAFE_PATH.test(rel) || rel.split('/').includes('..')) {
        problems.push(`.claude/skills/${name}/${rel}: file names may only use letters, digits, ".", "_", "-" and "/" (no spaces).`);
      }
      const st = fs.statSync(path.join(dir, rel));
      const exec = (st.mode & 0o111) !== 0 || /(^|\/)scripts\/[^/]+\.sh$/.test(rel);
      return { path: rel, size: st.size, exec };
    });
    // Content fingerprint: changes whenever any file in the skill changes.
    // The installer stores it in <skill>/.codegem-version so --update can
    // tell which installed skills are out of date.
    const hash = createHash('sha256');
    for (const f of [...files].sort((x, y) => (x.path < y.path ? -1 : 1))) {
      hash.update(f.path).update('\0').update(fs.readFileSync(path.join(dir, f.path))).update('\0');
    }
    const version = hash.digest('hex').slice(0, 12);

    skills.push({
      name,
      displayName: front.name && front.name !== name ? String(front.name) : name,
      group: m.group || OTHER_GROUP.name,
      inMeta: Boolean(meta.skills[name]),
      featured: Boolean(m.featured),
      summary: m.summary || what || description || name,
      what: what || description,
      whenToUse: m.whenToUse || when,
      description,
      commands: Array.isArray(m.commands) && m.commands.length ? m.commands : extracted.commands,
      phrases: extracted.phrases,
      deps,
      allDeps: [],
      usedBy: [],
      files,
      version,
      body,
    });
  }

  if (problems.length) throw new SkillsBuildError(problems);

  const byName = new Map(skills.map((s) => [s.name, s]));
  for (const s of skills) s.allDeps = resolveDeps(s.name, direct);
  for (const s of skills) for (const d of s.allDeps) byName.get(d).usedBy.push(s.name);
  for (const s of skills) s.usedBy.sort();

  const groups = [...meta.groups, OTHER_GROUP]
    .map((g) => ({ ...g, skills: skills.filter((s) => s.group === g.name).map((s) => s.name) }))
    .filter((g) => g.skills.length);

  // Every folder must be in the manifest (guards against silent drops).
  const missing = folders.filter((f) => !byName.has(f));
  if (missing.length) throw new SkillsBuildError(missing.map((f) => `Skill folder "${f}" is missing from the manifest.`));

  return {
    siteUrl: siteUrl || resolveSiteUrl().url,
    releasesRepo: resolveReleasesRepo(),
    generatedAt: new Date().toISOString(),
    skillCount: skills.length,
    fileCount: skills.reduce((n, s) => n + s.files.length, 0),
    groups,
    skills,
    warnings,
  };
}

/** The public manifest (no markdown bodies). */
export function publicManifest(manifest) {
  return {
    siteUrl: manifest.siteUrl,
    releasesRepo: manifest.releasesRepo,
    generatedAt: manifest.generatedAt,
    skillCount: manifest.skillCount,
    fileCount: manifest.fileCount,
    groups: manifest.groups,
    skills: manifest.skills.map(({ body, inMeta, ...rest }) => rest),
  };
}

/**
 * Tab-separated index for install.sh (stock bash has no JSON parser).
 *   skill <TAB> name <TAB> comma-separated resolved deps or "-" <TAB> version
 *   file  <TAB> name <TAB> x|- <TAB> relative path
 */
export function installIndex(manifest) {
  const lines = ['# codeGem skills install index. Generated at build time; do not edit.'];
  for (const s of manifest.skills) {
    lines.push(['skill', s.name, s.allDeps.join(',') || '-', s.version].join('\t'));
    for (const f of s.files) lines.push(['file', s.name, f.exec ? 'x' : '-', f.path].join('\t'));
  }
  return lines.join('\n') + '\n';
}

let cached;
/** Cached per process; Astro pages call this many times during one build. */
export function getManifest() {
  if (!cached) cached = buildManifest();
  return cached;
}
