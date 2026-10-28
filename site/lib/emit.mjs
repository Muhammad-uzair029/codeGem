// Writes the installable payload into the build output:
//   skills/<name>/...      every skill file, byte for byte
//   manifest.json          skills, files, groups, summaries, resolved deps
//   install-index.tsv      the same data in a form stock bash can read
//   install.sh, install.ps1 with the site URL baked in
// Then checks that every skill folder and file made it.
import fs from 'node:fs';
import path from 'node:path';
import { SITE_DIR, SKILLS_DIR, SkillsBuildError, publicManifest, installIndex } from './skills.mjs';

const TEMPLATE_DIR = path.join(SITE_DIR, 'installers');

export function renderInstaller(file, siteUrl) {
  const tpl = fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf8');
  if (!tpl.includes('@@SITE_URL@@')) throw new Error(`installers/${file} is missing the @@SITE_URL@@ token`);
  return tpl.replaceAll('@@SITE_URL@@', siteUrl);
}

export function writeInstallers(outDir, siteUrl) {
  fs.writeFileSync(path.join(outDir, 'install.sh'), renderInstaller('install.sh', siteUrl), { mode: 0o755 });
  // PowerShell 5 reads BOM-less files as ANSI; the script is pure ASCII so that is fine.
  fs.writeFileSync(path.join(outDir, 'install.ps1'), renderInstaller('install.ps1', siteUrl));
}

export function emit(outDir, manifest) {
  const skillsOut = path.join(outDir, 'skills');
  fs.rmSync(skillsOut, { recursive: true, force: true });
  for (const s of manifest.skills) {
    for (const f of s.files) {
      const src = path.join(SKILLS_DIR, s.name, f.path);
      const dst = path.join(skillsOut, s.name, f.path);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      if (f.exec) fs.chmodSync(dst, 0o755);
    }
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(publicManifest(manifest), null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'install-index.tsv'), installIndex(manifest));
  writeInstallers(outDir, manifest.siteUrl);
  writeSitemap(outDir, manifest.siteUrl);
  verify(outDir, manifest);
}

/** sitemap.xml (every built page) and robots.txt, using the real site URL. */
export function writeSitemap(outDir, siteUrl) {
  const pages = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (rel === '' && (e.name === 'skills' || e.name.startsWith('_'))) continue; // raw skill files, assets
        walk(path.join(dir, e.name), `${rel}${e.name}/`);
      } else if (e.name === 'index.html') pages.push(`/${rel}`);
    }
  };
  walk(outDir, '');
  pages.sort();
  const base = String(siteUrl || '').replace(/\/+$/, '');
  const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pages.map((p) => `  <url><loc>${base}${p}</loc></url>`), '</urlset>', ''].join('\n');
  fs.writeFileSync(path.join(outDir, 'sitemap.xml'), xml);
  fs.writeFileSync(path.join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
}

/** Fails the build if anything in .claude/skills/ did not make it into dist. */
export function verify(outDir, manifest) {
  const problems = [];
  const listed = new Set(manifest.skills.map((s) => s.name));
  const folders = fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name);
  for (const f of folders) if (!listed.has(f)) problems.push(`Skill folder "${f}" is missing from manifest.json.`);
  const written = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
  if (written.skills.length !== folders.length) {
    problems.push(`manifest.json has ${written.skills.length} skills but .claude/skills/ has ${folders.length} folders.`);
  }
  for (const s of manifest.skills) {
    for (const f of s.files) {
      if (!fs.existsSync(path.join(outDir, 'skills', s.name, f.path))) problems.push(`dist/skills/${s.name}/${f.path} was not written.`);
    }
  }
  for (const f of ['install.sh', 'install.ps1', 'install-index.tsv']) {
    if (!fs.existsSync(path.join(outDir, f))) problems.push(`dist/${f} was not written.`);
  }
  if (problems.length) throw new SkillsBuildError(problems);
}
