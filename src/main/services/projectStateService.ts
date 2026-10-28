import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type {
  FrameworkDetection,
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

// Framework detection is a best-effort read of the target project's
// package.json + a couple of well-known marker files. Restricted to the
// enums the spec allows; returns null when nothing matches.
export function detectFramework(targetPath: string): FrameworkDetection {
  const signals: string[] = [];
  if (!targetPath || !existsSync(targetPath) || !statSync(targetPath).isDirectory()) {
    return { framework: null, signals };
  }

  const pkgPath = join(targetPath, 'package.json');
  let pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  } = {};
  if (existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    } catch {
      pkg = {};
    }
  }
  const deps = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
    ...(pkg.peerDependencies ?? {}),
  };
  const scripts = pkg.scripts ?? {};

  // React Native / Expo signals.
  if (deps.expo) signals.push('dependency:expo');
  if (deps['react-native']) signals.push('dependency:react-native');
  if (Object.keys(scripts).some((s) => s === 'expo' || scripts[s]?.includes('expo'))) {
    signals.push('script:expo');
  }
  if (existsSync(join(targetPath, 'app.json'))) {
    try {
      const appJson = JSON.parse(readFileSync(join(targetPath, 'app.json'), 'utf8'));
      if (appJson && typeof appJson === 'object' && 'expo' in appJson) {
        signals.push('file:app.json[expo]');
      }
    } catch {
      /* noop */
    }
  }
  if (existsSync(join(targetPath, 'metro.config.js')) || existsSync(join(targetPath, 'metro.config.cjs'))) {
    signals.push('file:metro.config');
  }

  // NestJS signals.
  if (deps['@nestjs/core']) signals.push('dependency:@nestjs/core');
  if (deps['@nestjs/common']) signals.push('dependency:@nestjs/common');
  if (existsSync(join(targetPath, 'nest-cli.json'))) signals.push('file:nest-cli.json');

  const rn = signals.some((s) => s.includes('expo') || s.includes('react-native') || s.includes('metro'));
  const nest = signals.some((s) => s.includes('@nestjs') || s.includes('nest-cli'));

  // Prefer whichever has more marker signals; ties go to null so the UI
  // surfaces the ambiguity instead of silently guessing.
  if (rn && !nest) return { framework: 'REACT_NATIVE_EXPO', signals };
  if (nest && !rn) return { framework: 'NEST_JS', signals };
  return { framework: null, signals };
}
