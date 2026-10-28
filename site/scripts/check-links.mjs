// Checks every course and provider URL in content/courses.yaml and exits 1 if
// any is dead, so the weekly CI run fails and GitHub emails the repo owner.
//   node scripts/check-links.mjs
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const catalog = parse(readFileSync(new URL('../content/courses.yaml', import.meta.url), 'utf8'));
const urls = new Map();
for (const p of catalog.providers ?? []) {
  if (p.url) urls.set(p.url, `${p.name} (provider)`);
  for (const c of p.courses ?? []) urls.set(c.url, `${p.name}: ${c.title}`);
}

async function status(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, { method, redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
      if (res.ok) return res.status;
      if (method === 'GET') return res.status;
    } catch (e) {
      if (method === 'GET') return `error: ${e.message}`;
    }
  }
}

const results = [];
const list = [...urls];
for (let i = 0; i < list.length; i += 8) {
  results.push(...(await Promise.all(list.slice(i, i + 8).map(async ([url, label]) => ({ url, label, s: await status(url) })))));
}
// 403/429 usually mean a bot wall, not a dead page; report but don't fail.
const dead = results.filter((r) => typeof r.s !== 'number' || (r.s >= 400 && r.s !== 403 && r.s !== 429));
const walled = results.filter((r) => r.s === 403 || r.s === 429);
for (const r of walled) console.log(`warn  ${r.s}  ${r.label}  ${r.url}`);
for (const r of dead) console.log(`DEAD  ${r.s}  ${r.label}  ${r.url}`);
console.log(`Checked ${results.length} links: ${results.length - dead.length - walled.length} ok, ${walled.length} blocked by bot walls, ${dead.length} dead.`);
process.exit(dead.length ? 1 : 0);
