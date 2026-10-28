import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  LayoutConfig,
  PersistentConfig,
  ProjectType,
  TargetFramework,
} from '@shared/ipc';
import { userDataPath } from './pathService.js';

const CONFIG_FILENAME = 'config.json';
const HISTORY_CAP = 24;

const EMPTY_CONFIG: PersistentConfig = {
  active_project_path: null,
  project_type: null,
  target_framework: null,
  history: [],
};

function configPath(): string {
  const dir = userDataPath();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, CONFIG_FILENAME);
}

export function readConfig(): PersistentConfig {
  const file = configPath();
  if (!existsSync(file)) return { ...EMPTY_CONFIG };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<PersistentConfig>;
    return {
      active_project_path: parsed.active_project_path ?? null,
      project_type: parsed.project_type ?? null,
      target_framework: parsed.target_framework ?? null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      layout: parsed.layout,
      isolate_runs: parsed.isolate_runs,
    };
  } catch {
    return { ...EMPTY_CONFIG };
  }
}

function writeConfig(cfg: PersistentConfig): PersistentConfig {
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + '\n');
  return cfg;
}

export function setActiveProject(patch: {
  active_project_path: string;
  project_type: ProjectType;
  target_framework: TargetFramework | null;
}): PersistentConfig {
  const cfg = readConfig();
  const next: PersistentConfig = {
    active_project_path: patch.active_project_path,
    project_type: patch.project_type,
    target_framework: patch.target_framework,
    history: cfg.history,
    isolate_runs: cfg.isolate_runs,
  };
  const filtered = next.history.filter((h) => h.active_project_path !== patch.active_project_path);
  filtered.unshift({
    active_project_path: patch.active_project_path,
    project_type: patch.project_type,
    target_framework: patch.target_framework,
    last_used_at: new Date().toISOString(),
  });
  next.history = filtered.slice(0, HISTORY_CAP);
  return writeConfig(next);
}

export function clearActiveProject(): PersistentConfig {
  const cfg = readConfig();
  return writeConfig({
    ...cfg,
    active_project_path: null,
    project_type: null,
    target_framework: null,
  });
}

export function setLayout(sizes: [number, number, number]): PersistentConfig {
  const cfg = readConfig();
  const layout: LayoutConfig = { panel_sizes: sizes };
  return writeConfig({ ...cfg, layout });
}

export function setIsolateRuns(on: boolean): PersistentConfig {
  const cfg = readConfig();
  return writeConfig({ ...cfg, isolate_runs: on });
}

// Isolation is on unless the user explicitly turned it off.
export function isolateRunsEnabled(): boolean {
  return readConfig().isolate_runs !== false;
}

// Persisted framework for a project path: the active project first, then
// history. Used by skill injection when the request omits a framework.
export function persistedFrameworkFor(targetPath: string): TargetFramework | null {
  const cfg = readConfig();
  if (cfg.active_project_path === targetPath) return cfg.target_framework ?? null;
  return cfg.history.find((h) => h.active_project_path === targetPath)?.target_framework ?? null;
}
