import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectFramework } from '../src/main/services/frameworkDetection';

// Non-Electron spec: exercises framework detection on temp folders, and
// checks scripts/detect-framework.sh agrees with the TS implementation.

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(here, '..', 'scripts', 'detect-framework.sh');

type Files = Record<string, string>;

const pkg = (deps: Record<string, string>): string => JSON.stringify({ dependencies: deps });

const CASES: Array<{ name: string; files: Files; expected: string | null }> = [
  { name: 'empty folder', files: {}, expected: null },
  { name: 'expo app', files: { 'package.json': pkg({ expo: '^51.0.0', 'react-native': '0.74.0' }) }, expected: 'REACT_NATIVE_EXPO' },
  { name: 'nest service', files: { 'package.json': pkg({ '@nestjs/core': '^10.0.0' }), 'nest-cli.json': '{}' }, expected: 'NEST_JS' },
  { name: 'rn + nest is ambiguous', files: { 'package.json': pkg({ expo: '1', '@nestjs/core': '1' }) }, expected: null },
  { name: 'next app', files: { 'package.json': pkg({ next: '15.0.0', react: '19.0.0' }) }, expected: 'NEXT_JS' },
  { name: 'nest beats next', files: { 'package.json': pkg({ next: '15.0.0', '@nestjs/core': '1' }) }, expected: 'NEST_JS' },
  {
    name: 'fastapi via pyproject',
    files: { 'pyproject.toml': '[project]\nname = "svc"\ndependencies = ["fastapi>=0.110", "uvicorn"]\n' },
    expected: 'FASTAPI',
  },
  { name: 'fastapi via requirements-dev.txt', files: { 'requirements-dev.txt': 'pytest\nFastAPI==0.111.0\n' }, expected: 'FASTAPI' },
  { name: 'flask is not fastapi', files: { 'requirements.txt': 'flask==3.0.0\n' }, expected: null },
  { name: 'go module', files: { 'go.mod': 'module example.com/svc\n\ngo 1.22\n' }, expected: 'GO' },
  { name: 'next + go is ambiguous', files: { 'package.json': pkg({ next: '15' }), 'go.mod': 'module x\n' }, expected: null },
];

let root = '';

test.beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'codegem-detect-'));
});

test.afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

for (const [i, c] of CASES.entries()) {
  test(`detects ${c.name}`, () => {
    const dir = join(root, String(i));
    mkdirSync(dir, { recursive: true });
    for (const [file, content] of Object.entries(c.files)) {
      writeFileSync(join(dir, file), content);
    }
    expect(detectFramework(dir).framework).toBe(c.expected);
    const cli = execFileSync('bash', [SCRIPT, dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    expect(cli).toBe(c.expected ?? 'UNKNOWN');
  });
}

test('missing path returns null with no signals', () => {
  expect(detectFramework(join(root, 'does-not-exist'))).toEqual({ framework: null, signals: [] });
});
