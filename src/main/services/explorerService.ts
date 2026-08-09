import { ipcMain } from 'electron';
import { readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync, spawn } from 'node:child_process';
import type { ExplorerReadTreeResult, FileNode } from '@shared/ipc';

const IGNORE = new Set([
  'node_modules', '.git', 'dist', 'out', '.next', 'build', '.turbo',
  '.cache', '__pycache__', '.pytest_cache', '.mypy_cache',
]);

const MAX_ENTRIES = 5000;
const MAX_DEPTH = 6;

let entryCount = 0;

function buildTree(dir: string, depth: number): FileNode[] {
  if (depth > MAX_DEPTH || entryCount >= MAX_ENTRIES) return [];
  let entries: { name: string; isDir: boolean }[] = [];
  try {
    entries = readdirSync(dir)
      .filter((n) => !IGNORE.has(n) && !n.startsWith('.claude/specs'))
      .map((name) => {
        try {
          return { name, isDir: statSync(join(dir, name)).isDirectory() };
        } catch {
          return null;
        }
      })
      .filter((e): e is { name: string; isDir: boolean } => e !== null);
  } catch {
    return [];
  }

  // Dirs first, then files, both alpha-sorted.
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const nodes: FileNode[] = [];
  for (const e of entries) {
    if (entryCount >= MAX_ENTRIES) break;
    entryCount++;
    const path = join(dir, e.name);
    const node: FileNode = { id: path, name: e.name, path, isDir: e.isDir };
    if (e.isDir) {
      node.children = buildTree(path, depth + 1);
    }
    nodes.push(node);
  }
  return nodes;
}

function hasVSCode(): boolean {
  try {
    execSync('which code', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function registerExplorerIpc(): void {
  ipcMain.handle('explorer:readTree', (_evt, projectPath: string): ExplorerReadTreeResult => {
    try {
      entryCount = 0;
      const tree = buildTree(projectPath, 0);
      return { ok: true, tree };
    } catch (err) {
      return { ok: false, tree: [], reason: String(err) };
    }
  });

  ipcMain.handle(
    'explorer:openInVSCode',
    (_evt, projectPath: string): { ok: boolean; reason?: string } => {
      if (!hasVSCode()) {
        return { ok: false, reason: 'VS Code CLI not found. Install via: Shell Cmd: Install code' };
      }
      try {
        spawn('code', [projectPath], { detached: true, stdio: 'ignore' }).unref();
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: String(err) };
      }
    },
  );

  ipcMain.handle('explorer:openInFinder', (_evt, projectPath: string): { ok: boolean } => {
    try {
      spawn('open', [projectPath], { detached: true, stdio: 'ignore' }).unref();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('explorer:hasVSCodeCli', (): boolean => hasVSCode());
}
