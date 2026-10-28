import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { RunRecord } from '@shared/ipc';
import { userDataPath } from './pathService.js';
import { RUN_RECORD_FILE, latestRunFor, recoverCrashedRuns, upsertRunList } from './loopHelpers.js';

// Run history for resume-after-failure. Lives in userData/runs.json
// (newest first, capped) and each record is mirrored into the run's cwd
// so the target project carries its own breadcrumb.

const RUNS_FILENAME = 'runs.json';

function runsPath(): string {
  const dir = userDataPath();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, RUNS_FILENAME);
}

export function readRuns(): RunRecord[] {
  const file = runsPath();
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as RunRecord[]) : [];
  } catch {
    return [];
  }
}

function writeRuns(list: RunRecord[]): void {
  try {
    writeFileSync(runsPath(), JSON.stringify(list, null, 2) + '\n');
  } catch {
    /* history is best effort — never break a run over it */
  }
}

function writeMirror(rec: RunRecord): void {
  try {
    const file = join(rec.cwd, RUN_RECORD_FILE);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(rec, null, 2) + '\n');
  } catch {
    /* cwd may be read-only or gone */
  }
}

export function saveRun(rec: RunRecord): RunRecord {
  writeRuns(upsertRunList(readRuns(), rec));
  writeMirror(rec);
  return rec;
}

export function getRun(id: string): RunRecord | null {
  return readRuns().find((r) => r.id === id) ?? null;
}

export function latestRun(targetPath: string): RunRecord | null {
  return latestRunFor(readRuns(), targetPath);
}

// Called once at startup: the app loses track of its children across a
// restart, so anything still `running` belongs to a crashed session.
export function recoverCrashed(): void {
  const before = readRuns();
  const { list, changed } = recoverCrashedRuns(before, new Date().toISOString());
  if (!changed) return;
  writeRuns(list);
  for (const rec of list) {
    if (before.find((r) => r.id === rec.id)?.status === 'running') writeMirror(rec);
  }
}
