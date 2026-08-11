import { ipcMain } from 'electron';
import { inflateRawSync } from 'node:zlib';
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  SkillInfo,
  SkillsRemoteListResult,
  SkillsInstallResult,
  SkillsCacheStatus,
} from '@shared/ipc';
import { userDataPath } from './pathService.js';

const ZIP_URL =
  'https://codeload.github.com/Muhammad-uzair029/claude-code-boilerplate/zip/refs/heads/main';

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
// Minimal ZIP parser — no external dependencies.
// Supports stored (method 0) and DEFLATE (method 8) entries.
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;       // full path inside ZIP
  data: Buffer;       // decompressed content
}

function parseZip(buf: Buffer): ZipEntry[] {
  // Find End-of-Central-Directory signature (search from end).
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid ZIP file');

  const cdOffset = buf.readUInt32LE(eocd + 16);
  const cdSize   = buf.readUInt32LE(eocd + 12);
  const entries: ZipEntry[] = [];

  let pos = cdOffset;
  while (pos < cdOffset + cdSize) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;

    const method           = buf.readUInt16LE(pos + 10);
    const compressedSize   = buf.readUInt32LE(pos + 20);
    const uncompressedSize = buf.readUInt32LE(pos + 24);
    const nameLen          = buf.readUInt16LE(pos + 28);
    const extraLen         = buf.readUInt16LE(pos + 30);
    const commentLen       = buf.readUInt16LE(pos + 32);
    const localOffset      = buf.readUInt32LE(pos + 42);
    const name             = buf.toString('utf8', pos + 46, pos + 46 + nameLen);
    pos += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue; // directory entry

    // Local file header: skip to data
    const localNameLen  = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart     = localOffset + 30 + localNameLen + localExtraLen;

    let data: Buffer;
    if (method === 0) {
      data = buf.subarray(dataStart, dataStart + uncompressedSize);
    } else if (method === 8) {
      data = inflateRawSync(buf.subarray(dataStart, dataStart + compressedSize));
    } else {
      continue; // unsupported compression method — skip
    }

    entries.push({ name, data });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function downloadZip(): Promise<Buffer> {
  const response = await fetch(ZIP_URL);
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function getTopFolder(entries: ZipEntry[]): string {
  for (const e of entries) {
    const parts = e.name.split('/');
    if (parts.length >= 2 && parts[1] === '.claude') return `${parts[0]}/`;
  }
  const first = entries[0];
  if (first) return `${first.name.split('/')[0]}/`;
  throw new Error('Could not locate top-level folder in ZIP');
}

function listSkills(entries: ZipEntry[], topFolder: string): string[] {
  const prefix = `${topFolder}.claude/skills/`;
  const names = new Set<string>();
  for (const e of entries) {
    if (e.name.startsWith(prefix)) {
      const name = e.name.slice(prefix.length).split('/')[0];
      if (name) names.add(name);
    }
  }
  return [...names].sort();
}

function parseSkillDescription(entries: ZipEntry[], topFolder: string, skillName: string): string {
  const target = `${topFolder}.claude/skills/${skillName}/SKILL.md`;
  const entry = entries.find((e) => e.name === target);
  if (!entry) return skillName;

  let inFrontmatter = false;
  let frontmatterDone = false;
  for (const line of entry.data.toString('utf8').split('\n')) {
    const t = line.trim();
    if (!frontmatterDone && t === '---') {
      inFrontmatter ? (frontmatterDone = true) : (inFrontmatter = true);
      continue;
    }
    if (inFrontmatter && !frontmatterDone) continue;
    if (t) return t.replace(/^#+\s*/, '');
  }
  return skillName;
}

function extractSkills(entries: ZipEntry[], topFolder: string, names: string[], cacheDir: string): void {
  const skillsDir = join(cacheDir, '.claude', 'skills');

  for (const name of names) {
    const prefix = `${topFolder}.claude/skills/${name}/`;
    for (const entry of entries) {
      if (!entry.name.startsWith(prefix)) continue;
      const rel  = entry.name.slice(prefix.length);
      const dest = join(skillsDir, name, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, entry.data);
    }
  }

  const claudeMd = entries.find((e) => e.name === `${topFolder}.claude/CLAUDE.md`);
  if (claudeMd) {
    const claudeDir = join(cacheDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'CLAUDE.md'), claudeMd.data);
  }
}

function countInstalledSkills(cacheDir: string): number {
  const skillsDir = join(cacheDir, '.claude', 'skills');
  if (!existsSync(skillsDir)) return 0;
  return readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

export function registerSkillsRemoteIpc(): void {
  ipcMain.handle('skillsRemote:fetchList', async (): Promise<SkillsRemoteListResult> => {
    try {
      const buf      = await downloadZip();
      const entries  = parseZip(buf);
      const topFolder = getTopFolder(entries);
      const names    = listSkills(entries, topFolder);
      const skills: SkillInfo[] = names.map((name) => ({
        name,
        description: parseSkillDescription(entries, topFolder, name),
      }));
      return { ok: true, skills };
    } catch (err) {
      return { ok: false, skills: [], reason: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('skillsRemote:install', async (_evt, names: string[]): Promise<SkillsInstallResult> => {
    const cacheDir = boilerplateCacheDir();
    try {
      const buf      = await downloadZip();
      const entries  = parseZip(buf);
      const topFolder = getTopFolder(entries);
      try {
        extractSkills(entries, topFolder, names, cacheDir);
      } catch (err) {
        if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
        throw err;
      }
      writeMeta({ downloadedAt: new Date().toISOString(), ref: 'main', skills: names });
      return { ok: true, count: countInstalledSkills(cacheDir) };
    } catch (err) {
      return { ok: false, count: 0, reason: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('skillsRemote:installAll', async (): Promise<SkillsInstallResult> => {
    const cacheDir = boilerplateCacheDir();
    try {
      const buf      = await downloadZip();
      const entries  = parseZip(buf);
      const topFolder = getTopFolder(entries);
      const names    = listSkills(entries, topFolder);
      try {
        extractSkills(entries, topFolder, names, cacheDir);
      } catch (err) {
        if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
        throw err;
      }
      writeMeta({ downloadedAt: new Date().toISOString(), ref: 'main', skills: names });
      return { ok: true, count: countInstalledSkills(cacheDir) };
    } catch (err) {
      return { ok: false, count: 0, reason: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('skillsRemote:skip', async (): Promise<void> => {
    writeMeta({ downloadedAt: new Date().toISOString(), ref: 'main', skills: [], skipped: true });
  });

  ipcMain.handle('skillsRemote:status', async (): Promise<SkillsCacheStatus> => {
    const meta = readMeta();
    if (!meta) return { installed: false, downloadedAt: null, count: 0, skills: [], skipped: false };
    return {
      installed:   !meta.skipped,
      downloadedAt: meta.downloadedAt ?? null,
      count:       countInstalledSkills(boilerplateCacheDir()),
      skills:      meta.skills,
      skipped:     meta.skipped ?? false,
    };
  });
}
