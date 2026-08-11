import { app } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the source-of-truth for the boilerplate repo (the repo that ships
// this manager app). Skill injection copies FROM this location INTO the
// user-selected target project.
//
// Layout assumption:
//   packaged: <repo>/apps/feature-loop-manager/out/main/services/pathService.js
//   dev:     <repo>/apps/feature-loop-manager/src/main/services/pathService.ts
// In both cases the boilerplate root is a few dir hops above.
export function boilerplateRepoRoot(): string {
  // Priority 1: user's downloaded cache (from skillsRemoteService)
  const userDataCache = join(app.getPath('userData'), 'boilerplate');
  if (existsSync(join(userDataCache, '.claude', 'skills'))) {
    return userDataCache;
  }

  // Priority 2: dev mode — walk up directory tree
  const here = dirname(fileURLToPath(import.meta.url));
  let cursor = here;
  for (let hop = 0; hop < 10; hop++) {
    if (existsSync(join(cursor, '.claude', 'skills', 'feature-loop'))) {
      return cursor;
    }
    const parent = resolve(cursor, '..');
    if (parent === cursor) break;
    cursor = parent;
  }

  // Priority 3: bundled fallback (extraResources)
  const resourceFallback = join(process.resourcesPath ?? '', 'boilerplate');
  if (existsSync(join(resourceFallback, '.claude', 'skills'))) {
    return resourceFallback;
  }

  throw new Error(
    `Could not locate boilerplate repo root. Download skills via the onboarding screen or Settings.`,
  );
}

export function boilerplateSkillsDir(): string {
  return join(boilerplateRepoRoot(), '.claude', 'skills');
}

export function boilerplateTemplateClaudeMd(): string {
  // Bundled via electron-vite resource inlining — resolve from the app root
  // during dev, and from resourcesPath after packaging.
  const here = dirname(fileURLToPath(import.meta.url));
  // dev: src/main/services → up 3 = apps/feature-loop-manager/
  const devPath = resolve(here, '..', '..', '..', 'templates', 'CLAUDE.md');
  if (existsSync(devPath)) return devPath;
  const packagedPath = join(process.resourcesPath ?? '', 'templates', 'CLAUDE.md');
  if (existsSync(packagedPath)) return packagedPath;
  return devPath;
}

export function desktopDefault(): string {
  try {
    return app.getPath('desktop');
  } catch {
    return app.getPath('home');
  }
}

export function userDataPath(): string {
  return app.getPath('userData');
}
