import { ipcMain } from 'electron';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { SkillInjectionRequest, SkillInjectionResult } from '@shared/ipc';
import { CLIENT_CLAUDE_BLUEPRINT } from '@shared/projectSchema';
import { stackTemplateFor } from '@shared/stacks';
import { boilerplateSkillsDir, boilerplateTemplateClaudeMd, templatePath } from './pathService.js';
import { persistedFrameworkFor } from './projectStateService.js';

const FALLBACK_CLAUDE_MD = `# Project — orchestrated by SkillFacet

This project was scaffolded (or adopted) by SkillFacet. See
\`.claude/skills/\` for the injected skill matrix. Canonical entry points:

- \`feature-loop\` — 6-stage autonomous feature-development engine.
- \`figma-to-code\` — Figma MCP layout translation engine.
- \`quality-assurance\` — self-healing compilation verification engine.

## Verification-loop macros

- \`/feature-loop -y <mod>/<feat>\` — end-to-end unattended run.
- \`/feature-loop --verify-only <mod>/<feat>\` — verifier alone against current diff.
- \`/quality-assurance\` — invoke the compile-gate composition (pre-merge-check,
  contract-drift-check, null-safety-scan) with self-healing retries.

## Global agent behavior rules

- Feature-loop is the primary entry point. No hand-written HTTP call code in
  the mobile/web client — Orval-generated hooks only. Every commit passes the
  full 42-rule security-audit. Contracts live in versioned schemas.
- Self-healing is authoritative during Stage 3. Do not intervene mid-loop.

## Cache discipline

This CLAUDE.md is loaded at the top of every conversation. Keep it stable.
Volatile per-workspace concerns belong under \`apps/<workspace>/CLAUDE.md\`.
`;

function copyDirRecursive(src: string, dst: string, overwrite: boolean): number {
  let copied = 0;
  const stack: Array<[string, string]> = [[src, dst]];
  while (stack.length) {
    const [s, d] = stack.pop()!;
    mkdirSync(d, { recursive: true });
    for (const entry of readdirSync(s, { withFileTypes: true })) {
      const sp = join(s, entry.name);
      const dp = join(d, entry.name);
      if (entry.isDirectory()) {
        stack.push([sp, dp]);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        if (!overwrite && existsSync(dp)) continue;
        cpSync(sp, dp, { force: overwrite, preserveTimestamps: true });
        copied += 1;
      }
    }
  }
  return copied;
}

function countSkills(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
}

// Ensure the three canonical skill dirs required by the client blueprint
// exist in the injected .claude/skills/. If the boilerplate ships them
// natively they'll already be present after copyDirRecursive; if not, we
// synthesize a thin SKILL.md wrapper so the layout contract is satisfied.
function ensureCanonicalSkillDirs(dstSkills: string): string[] {
  const ensured: string[] = [];
  const fallbacks: Record<string, () => string> = {
    'feature-loop': () =>
      '# feature-loop\n\nCanonical entry — see the full SKILL.md shipped by the boilerplate.\n',
    'figma-to-code': () =>
      '---\nname: figma-to-code\ndescription: Canonical alias for `figma-to-code-skill`. Figma MCP layout translation engine.\n---\n\n# figma-to-code\n\nCanonical alias for the boilerplate\'s Figma → React Native translation skill. See `../figma-to-code-skill/SKILL.md` for the full playbook.\n',
    'quality-assurance': () =>
      '---\nname: quality-assurance\ndescription: Self-healing compilation verification engine — composes pre-merge-check, contract-drift-check, and null-safety-scan behind a single entry.\n---\n\n# quality-assurance\n\nComposes the Stage 3 compile-gate: `pre-merge-check` (lint + typecheck + tests), `contract-drift-check` (cross-workspace type drift), and `null-safety-scan` (null / undef / None on the diff). On FAIL, the feature-loop verifier pipes the raw stack trace back to the implementer with up to 3 self-healing retries. See `.claude/skills/feature-loop/agents/verifier.md` § Self-healing loop for the packet contract.\n',
  };
  for (const name of CLIENT_CLAUDE_BLUEPRINT.dirs.skills.canonical) {
    const dir = join(dstSkills, name);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const skillMd = join(dir, 'SKILL.md');
    if (!existsSync(skillMd)) {
      writeFileSync(skillMd, fallbacks[name]());
    }
    ensured.push(name);
  }
  return ensured;
}

export function registerSkillsIpc(): void {
  ipcMain.handle(
    'skills:inject',
    async (_evt, req: SkillInjectionRequest): Promise<SkillInjectionResult> => {
      if (!req?.targetPath) {
        return {
          ok: false,
          skillsCopied: 0,
          claudeMdWritten: false,
          canonicalDirsEnsured: [],
          reason: 'Missing targetPath.',
        };
      }
      if (!existsSync(req.targetPath) || !statSync(req.targetPath).isDirectory()) {
        return {
          ok: false,
          skillsCopied: 0,
          claudeMdWritten: false,
          canonicalDirsEnsured: [],
          reason: `Target path is not a directory: ${req.targetPath}.`,
        };
      }
      const overwrite = req.overwrite ?? true;
      const srcSkills = boilerplateSkillsDir();
      if (!existsSync(srcSkills)) {
        return {
          ok: false,
          skillsCopied: 0,
          claudeMdWritten: false,
          canonicalDirsEnsured: [],
          reason: `Source skills dir not found: ${srcSkills}.`,
        };
      }
      const dstSkills = join(req.targetPath, CLIENT_CLAUDE_BLUEPRINT.dirs.skills.root);
      let skillsCopied = 0;
      let canonicalDirsEnsured: string[] = [];
      try {
        if (req.skills && req.skills.length > 0) {
          // Selective injection — only copy the requested skill folders
          for (const skillName of req.skills) {
            const src = join(srcSkills, skillName);
            const dst = join(dstSkills, skillName);
            if (existsSync(src)) copyDirRecursive(src, dst, overwrite);
          }
        } else {
          copyDirRecursive(srcSkills, dstSkills, overwrite);
        }
        canonicalDirsEnsured = ensureCanonicalSkillDirs(dstSkills);
        skillsCopied = countSkills(dstSkills);
      } catch (err) {
        return {
          ok: false,
          skillsCopied,
          claudeMdWritten: false,
          canonicalDirsEnsured,
          reason: `Skill copy failed: ${err instanceof Error ? err.message : String(err)}.`,
        };
      }

      // Bootstrap the specs/ tree per the blueprint.
      mkdirSync(join(req.targetPath, CLIENT_CLAUDE_BLUEPRINT.dirs.specs.inbox), {
        recursive: true,
      });
      mkdirSync(join(req.targetPath, CLIENT_CLAUDE_BLUEPRINT.dirs.specs.active), {
        recursive: true,
      });

      const claudeMdPath = join(req.targetPath, CLIENT_CLAUDE_BLUEPRINT.files.claudeMd);
      const claudeMdExists = existsSync(claudeMdPath);
      let claudeMdWritten = false;
      if (!claudeMdExists || overwrite) {
        let content = FALLBACK_CLAUDE_MD;
        try {
          // Stack template: explicit request framework, else the one the
          // project selector persisted, else the RN/Nest default template.
          const framework =
            req.framework !== undefined ? req.framework : persistedFrameworkFor(req.targetPath);
          let tplPath = templatePath(stackTemplateFor(framework));
          if (!existsSync(tplPath)) tplPath = boilerplateTemplateClaudeMd();
          if (existsSync(tplPath)) {
            content = readFileSync(tplPath, 'utf8');
          }
        } catch {
          /* fall through to inline default */
        }
        writeFileSync(claudeMdPath, content);
        claudeMdWritten = true;
      }
      return { ok: true, skillsCopied, claudeMdWritten, canonicalDirsEnsured };
    },
  );

  // List skill folder names already injected in a target project
  ipcMain.handle('skills:listInProject', async (_evt, targetPath: string): Promise<string[]> => {
    const skillsDir = join(targetPath, CLIENT_CLAUDE_BLUEPRINT.dirs.skills.root);
    if (!existsSync(skillsDir)) return [];
    return readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  });

  // List skill folder names available in the boilerplate cache
  ipcMain.handle('skills:listAvailable', async (): Promise<string[]> => {
    try {
      const dir = boilerplateSkillsDir();
      if (!existsSync(dir)) return [];
      return readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
  });
}
