import { ipcMain } from 'electron';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync, readFileSync, readdirSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  SkillInfo,
  SkillsRemoteListResult,
  SkillsInstallResult,
  SkillsCacheStatus,
} from '@shared/ipc';
import { SKILLS_SITE_URL } from '@shared/siteConfig';
import { userDataPath } from './pathService.js';

// Skills come from the SkillFacet skills site — the same manifest.json and
// files the one-line installer (install.sh / install.ps1 --update) uses —
// so the app and the website always serve one source of truth.
// CODEGEM_SKILLS_URL overrides the site (tests, self-hosted mirrors).
function siteUrl(): string {
  return (process.env.CODEGEM_SKILLS_URL || SKILLS_SITE_URL).replace(/\/+$/, '');
}

function boilerplateCacheDir(): string {
  return join(userDataPath(), 'boilerplate');
}

function metaPath(): string {
  return join(boilerplateCacheDir(), 'meta.json');
}

interface Meta {
  downloadedAt: string;
  ref: string;
  skills: string[];
  skipped?: boolean;
}

function readMeta(): Meta | null {
  try {
    return JSON.parse(readFileSync(metaPath(), 'utf8')) as Meta;
  } catch {
    return null;
  }
}

function writeMeta(meta: Meta): void {
  mkdirSync(boilerplateCacheDir(), { recursive: true });
  writeFileSync(metaPath(), JSON.stringify(meta, null, 2));
}

// ---------------------------------------------------------------------------
// Site manifest
// ---------------------------------------------------------------------------

interface ManifestFile { path: string; exec?: boolean }
interface ManifestSkill {
  name: string;
  summary?: string;
  description?: string;
  version?: string;
  allDeps?: string[];
  files: ManifestFile[];
}
interface Manifest { skills: ManifestSkill[]; generatedAt?: string }

async function fetchManifest(): Promise<Manifest> {
  const url = `${siteUrl()}/manifest.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Skills site returned ${res.status} for ${url}`);
  const m = (await res.json()) as Manifest;
  if (!Array.isArray(m?.skills) || m.skills.length === 0) throw new Error(`No skills listed at ${url}`);
  return m;
}

// Named skills plus everything they use, in manifest order.
function withDeps(manifest: Manifest, names: string[]): ManifestSkill[] {
  const byName = new Map(manifest.skills.map((s) => [s.name, s]));
  const unknown = names.filter((n) => !byName.has(n));
  if (unknown.length) throw new Error(`Unknown skill(s): ${unknown.join(', ')}`);
  const want = new Set(names);
  for (const n of names) for (const d of byName.get(n)!.allDeps ?? []) if (byName.has(d)) want.add(d);
  return manifest.skills.filter((s) => want.has(s.name));
}

function safeRel(rel: string): boolean {
  return !rel.startsWith('/') && !rel.split(/[\\/]/).includes('..');
}

async function downloadSkill(skill: ManifestSkill, dest: string): Promise<void> {
  const base = siteUrl();
  // A handful of files per skill; fetch them in parallel.
  await Promise.all(
    skill.files.map(async (f) => {
      if (!safeRel(f.path)) throw new Error(`Refusing unsafe path in manifest: ${skill.name}/${f.path}`);
      const res = await fetch(`${base}/skills/${skill.name}/${f.path}`);
      if (!res.ok) throw new Error(`Download failed for ${skill.name}/${f.path} (${res.status})`);
      const out = join(dest, f.path);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, Buffer.from(await res.arrayBuffer()));
      if (f.exec) chmodSync(out, 0o755);
    }),
  );
  // Same marker the site installers write, so `install.sh --update` in a
  // project the app injected into knows which version it has.
  if (skill.version) writeFileSync(join(dest, '.codegem-version'), `${skill.version}\n`);
}

// Downloads into a staging folder first, then swaps each skill in, so a
// failed or partial download never damages the existing cache.
async function installSkills(skills: ManifestSkill[]): Promise<void> {
  const skillsDir = join(boilerplateCacheDir(), '.claude', 'skills');
  const stage = join(boilerplateCacheDir(), `.staging-${Date.now()}`);
  try {
    for (const s of skills) await downloadSkill(s, join(stage, s.name));
    mkdirSync(skillsDir, { recursive: true });
    for (const s of skills) {
      const dest = join(skillsDir, s.name);
      rmSync(dest, { recursive: true, force: true });
      renameSync(join(stage, s.name), dest);
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

function countInstalledSkills(cacheDir: string): number {
  const skillsDir = join(cacheDir, '.claude', 'skills');
  if (!existsSync(skillsDir)) return 0;
  return readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
}

const errorOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

async function installAllFromSite(): Promise<SkillsInstallResult> {
  try {
    const m = await fetchManifest();
    await installSkills(m.skills);
    // Drop skills the site no longer lists (e.g. left over from the old
    // GitHub-zip source) so the cache mirrors the site exactly.
    const keep = new Set(m.skills.map((s) => s.name));
    const skillsDir = join(boilerplateCacheDir(), '.claude', 'skills');
    for (const e of readdirSync(skillsDir, { withFileTypes: true })) {
      if (e.isDirectory() && !keep.has(e.name)) rmSync(join(skillsDir, e.name), { recursive: true, force: true });
    }
    writeMeta({ downloadedAt: new Date().toISOString(), ref: siteUrl(), skills: [...keep] });
    return { ok: true, count: countInstalledSkills(boilerplateCacheDir()) };
  } catch (err) {
    return { ok: false, count: 0, reason: errorOf(err) };
  }
}

/**
 * One-time switch for caches downloaded from the old GitHub zip source
 * (meta.ref isn't a URL): refresh them from the skills site in the
 * background so existing users get the current skills without clicking
 * "Update All". Best effort — on failure the old cache stays usable.
 */
export function refreshLegacyCache(): void {
  const meta = readMeta();
  if (!meta || meta.skipped || /^https?:\/\//.test(meta.ref)) return;
  console.log(`[skills] refreshing legacy cache (source "${meta.ref}") from ${siteUrl()}`);
  void installAllFromSite().then((r) => {
    if (r.ok) console.log(`[skills] cache refreshed: ${r.count} skills`);
    else console.warn(`[skills] cache refresh failed: ${r.reason}`);
  });
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

export function registerSkillsRemoteIpc(): void {
  ipcMain.handle('skillsRemote:fetchList', async (): Promise<SkillsRemoteListResult> => {
    try {
      const m = await fetchManifest();
      const skills: SkillInfo[] = m.skills.map((s) => ({
        name: s.name,
        description: s.summary || s.description || s.name,
      }));
      return { ok: true, skills };
    } catch (err) {
      return { ok: false, skills: [], reason: errorOf(err) };
    }
  });

  ipcMain.handle('skillsRemote:install', async (_evt, names: string[]): Promise<SkillsInstallResult> => {
    try {
      const m = await fetchManifest();
      const skills = withDeps(m, names);
      await installSkills(skills);
      writeMeta({ downloadedAt: new Date().toISOString(), ref: siteUrl(), skills: skills.map((s) => s.name) });
      return { ok: true, count: countInstalledSkills(boilerplateCacheDir()) };
    } catch (err) {
      return { ok: false, count: 0, reason: errorOf(err) };
    }
  });

  ipcMain.handle('skillsRemote:installAll', installAllFromSite);

  ipcMain.handle('skillsRemote:skip', async (): Promise<void> => {
    writeMeta({ downloadedAt: new Date().toISOString(), ref: siteUrl(), skills: [], skipped: true });
  });

  ipcMain.handle('skillsRemote:status', async (): Promise<SkillsCacheStatus> => {
    const source = siteUrl().replace(/^https?:\/\//, '');
    const meta = readMeta();
    if (!meta) return { installed: false, downloadedAt: null, count: 0, skills: [], skipped: false, source };
    return {
      installed:   !meta.skipped,
      downloadedAt: meta.downloadedAt ?? null,
      count:       countInstalledSkills(boilerplateCacheDir()),
      skills:      meta.skills,
      skipped:     meta.skipped ?? false,
      source,
    };
  });
}
