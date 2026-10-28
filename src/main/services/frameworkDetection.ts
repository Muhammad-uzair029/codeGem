import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FrameworkDetection } from '@shared/ipc';

// Pure node:fs module (no electron import) so it can be exercised from a
// plain Playwright spec. Mirrored by scripts/detect-framework.sh.

function readText(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

// FastAPI declared in pyproject.toml or any requirements*.txt at the root.
function pythonManifestsMentioningFastapi(targetPath: string): string[] {
  const candidates = ['pyproject.toml'];
  try {
    for (const name of readdirSync(targetPath)) {
      if (/^requirements.*\.txt$/.test(name)) candidates.push(name);
    }
  } catch {
    /* noop */
  }
  return candidates.filter((name) => {
    const p = join(targetPath, name);
    return existsSync(p) && /(^|[^A-Za-z0-9_])fastapi([^A-Za-z0-9_]|$)/im.test(readText(p));
  });
}

// Framework detection is a best-effort read of the target project's
// package.json + a couple of well-known marker files. Restricted to the
// TargetFramework enums; returns null when nothing (or more than one stack)
// matches. GENERIC is never detected — it is a manual pick.
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

  // Next.js / FastAPI / Go signals.
  if (deps.next) signals.push('dependency:next');
  for (const name of pythonManifestsMentioningFastapi(targetPath)) {
    signals.push(`dependency:fastapi[${name}]`);
  }
  if (existsSync(join(targetPath, 'go.mod'))) signals.push('file:go.mod');

  const rn = signals.some((s) => s.includes('expo') || s.includes('react-native') || s.includes('metro'));
  const nest = signals.some((s) => s.includes('@nestjs') || s.includes('nest-cli'));

  // RN / Nest keep precedence. Both present → null so the UI surfaces the
  // ambiguity instead of silently guessing.
  if (rn && !nest) return { framework: 'REACT_NATIVE_EXPO', signals };
  if (nest && !rn) return { framework: 'NEST_JS', signals };
  if (rn && nest) return { framework: null, signals };

  // Otherwise exactly one of the newer stacks must match; several → null.
  const next = signals.includes('dependency:next');
  const fastapi = signals.some((s) => s.startsWith('dependency:fastapi'));
  const go = signals.includes('file:go.mod');
  if (Number(next) + Number(fastapi) + Number(go) !== 1) return { framework: null, signals };
  if (next) return { framework: 'NEXT_JS', signals };
  if (fastapi) return { framework: 'FASTAPI', signals };
  return { framework: 'GO', signals };
}
