import { ipcMain } from 'electron';
import AdmZip from 'adm-zip';
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

function parseSkillDescription(zip: AdmZip, topFolder: string, skillName: string): string {
  const skillMdPath = `${topFolder}.claude/skills/${skillName}/SKILL.md`;
  const entry = zip.getEntry(skillMdPath);
  if (!entry) return skillName;
  const content = entry.getData().toString('utf8');
  const lines = content.split('\n');
  let inFrontmatter = false;
  let frontmatterDone = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!frontmatterDone && trimmed === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
        continue;
      } else {
        frontmatterDone = true;
        continue;
      }
    }
    if (inFrontmatter && !frontmatterDone) continue;
    if (trimmed) return trimmed.replace(/^#+\s*/, '');
  }
  return skillName;
}

async function downloadZip(): Promise<AdmZip> {
  const response = await fetch(ZIP_URL);
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return new AdmZip(Buffer.from(buffer));
}

function getTopFolder(zip: AdmZip): string {
  const entries = zip.getEntries();
  for (const entry of entries) {
    const parts = entry.entryName.split('/');
    if (parts.length >= 2 && parts[1] === '.claude') {
      return `${parts[0]}/`;
    }
  }
  const first = entries[0];
  if (first) return `${first.entryName.split('/')[0]}/`;
  throw new Error('Could not locate top-level folder in ZIP');
}

function listSkillsInZip(zip: AdmZip, topFolder: string): string[] {
  const prefix = `${topFolder}.claude/skills/`;
  const names = new Set<string>();
  for (const entry of zip.getEntries()) {
    if (entry.entryName.startsWith(prefix)) {
      const rest = entry.entryName.slice(prefix.length);
      const name = rest.split('/')[0];
      if (name) names.add(name);
    }
  }
  return [...names].sort();
}

function extractSkills(zip: AdmZip, topFolder: string, names: string[]): void {
  const cacheDir = boilerplateCacheDir();
  const skillsDir = join(cacheDir, '.claude', 'skills');

  for (const name of names) {
    const prefix = `${topFolder}.claude/skills/${name}/`;
    for (const entry of zip.getEntries()) {
      if (!entry.entryName.startsWith(prefix) || entry.isDirectory) continue;
      const relativePath = entry.entryName.slice(prefix.length);
      const destPath = join(skillsDir, name, relativePath);
      mkdirSync(dirname(destPath), { recursive: true });
      writeFileSync(destPath, entry.getData());
    }
  }

  const claudeMdEntry = zip.getEntry(`${topFolder}.claude/CLAUDE.md`);
  if (claudeMdEntry) {
    const claudeDir = join(cacheDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'CLAUDE.md'), claudeMdEntry.getData().toString('utf8'));
  }
}

export function registerSkillsRemoteIpc(): void {
  ipcMain.handle('skillsRemote:fetchList', async (): Promise<SkillsRemoteListResult> => {
    try {
      const zip = await downloadZip();
      const topFolder = getTopFolder(zip);
      const names = listSkillsInZip(zip, topFolder);
      const skills: SkillInfo[] = names.map((name) => ({
        name,
        description: parseSkillDescription(zip, topFolder, name),
      }));
      return { ok: true, skills };
    } catch (err) {
      return {
        ok: false,
        skills: [],
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle(
    'skillsRemote:install',
    async (_evt, names: string[]): Promise<SkillsInstallResult> => {
      const cacheDir = boilerplateCacheDir();
      try {
        const zip = await downloadZip();
        const topFolder = getTopFolder(zip);
        const skillsDir = join(cacheDir, '.claude', 'skills');
        try {
          extractSkills(zip, topFolder, names);
        } catch (err) {
          if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
          throw err;
        }
        writeMeta({
          downloadedAt: new Date().toISOString(),
          ref: 'main',
          skills: names,
        });
        const count = existsSync(skillsDir)
          ? readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length
          : 0;
        return { ok: true, count };
      } catch (err) {
        return {
          ok: false,
          count: 0,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle('skillsRemote:installAll', async (): Promise<SkillsInstallResult> => {
    const cacheDir = boilerplateCacheDir();
    try {
      const zip = await downloadZip();
      const topFolder = getTopFolder(zip);
      const names = listSkillsInZip(zip, topFolder);
      const skillsDir = join(cacheDir, '.claude', 'skills');
      try {
        extractSkills(zip, topFolder, names);
      } catch (err) {
        if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
        throw err;
      }
      writeMeta({
        downloadedAt: new Date().toISOString(),
        ref: 'main',
        skills: names,
      });
      const count = existsSync(skillsDir)
        ? readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length
        : 0;
      return { ok: true, count };
    } catch (err) {
      return {
        ok: false,
        count: 0,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle('skillsRemote:skip', async (): Promise<void> => {
    writeMeta({
      downloadedAt: new Date().toISOString(),
      ref: 'main',
      skills: [],
      skipped: true,
    });
  });

  ipcMain.handle('skillsRemote:status', async (): Promise<SkillsCacheStatus> => {
    const meta = readMeta();
    if (!meta) {
      return { installed: false, downloadedAt: null, count: 0, skills: [], skipped: false };
    }
    const skillsDir = join(boilerplateCacheDir(), '.claude', 'skills');
    const count = existsSync(skillsDir)
      ? readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length
      : 0;
    return {
      installed: !meta.skipped,
      downloadedAt: meta.downloadedAt ?? null,
      count,
      skills: meta.skills,
      skipped: meta.skipped ?? false,
    };
  });
}
