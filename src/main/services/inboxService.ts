import { ipcMain } from 'electron';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BriefIntake, BriefIntakeResult } from '@shared/ipc';
import { BRIEF_FILENAME, CLIENT_CLAUDE_BLUEPRINT } from '@shared/projectSchema';

const MAX_BRIEF_BYTES = 512 * 1024;

function parseFigmaUrl(url: string): { fileKey?: string; nodeId?: string } {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('figma.com')) return {};
    const parts = u.pathname.split('/').filter(Boolean);
    const keyIdx = parts.findIndex((p) => p === 'file' || p === 'design');
    const fileKey = keyIdx >= 0 ? parts[keyIdx + 1] : undefined;
    const raw = u.searchParams.get('node-id') ?? undefined;
    const nodeId = raw ? decodeURIComponent(raw).replace(/-/g, ':') : undefined;
    return { fileKey, nodeId };
  } catch {
    return {};
  }
}

function briefFrontmatter(req: BriefIntake): string {
  const lines: string[] = ['---'];
  lines.push(`created: ${new Date().toISOString()}`);
  if (req.figmaUrl) lines.push(`figma_url: ${req.figmaUrl}`);
  const { fileKey: parsedKey, nodeId: parsedNode } = req.figmaUrl
    ? parseFigmaUrl(req.figmaUrl)
    : {};
  const fileKey = req.figmaFileKey ?? parsedKey;
  const nodeId = req.figmaNodeId ?? parsedNode;
  if (fileKey) lines.push(`figma_file_key: ${fileKey}`);
  if (nodeId) lines.push(`figma_node_id: ${nodeId}`);
  if (req.figmaMcpUrl) lines.push(`figma_mcp_url: ${req.figmaMcpUrl}`);
  lines.push('---', '');
  return lines.join('\n');
}

function writeMcpJson(targetPath: string, figmaMcpUrl: string): boolean {
  const mcpPath = join(targetPath, '.mcp.json');
  let existing: Record<string, unknown> = {};
  if (existsSync(mcpPath)) {
    try {
      existing = JSON.parse(readFileSync(mcpPath, 'utf8'));
    } catch {
      existing = {};
    }
  }
  const servers = (existing.mcpServers as Record<string, unknown>) ?? {};
  servers.figma = { type: 'sse', url: figmaMcpUrl };
  const next = { ...existing, mcpServers: servers };
  writeFileSync(mcpPath, JSON.stringify(next, null, 2) + '\n');
  return true;
}

function inboxDirFor(targetPath: string): string {
  return join(targetPath, CLIENT_CLAUDE_BLUEPRINT.dirs.specs.inbox);
}

export function registerInboxIpc(): void {
  ipcMain.handle(
    'inbox:writeBrief',
    async (_evt, req: BriefIntake): Promise<BriefIntakeResult> => {
      if (!req?.targetPath) {
        return {
          ok: false,
          briefPath: '',
          mcpJsonWritten: false,
          reason: 'Missing targetPath.',
        };
      }
      const body = (req.briefMarkdown ?? '').trim();
      if (body.length === 0) {
        return {
          ok: false,
          briefPath: '',
          mcpJsonWritten: false,
          reason: 'Feature brief cannot be empty.',
        };
      }
      if (Buffer.byteLength(body, 'utf8') > MAX_BRIEF_BYTES) {
        return {
          ok: false,
          briefPath: '',
          mcpJsonWritten: false,
          reason: `Brief exceeds ${MAX_BRIEF_BYTES} bytes.`,
        };
      }
      const inboxDir = inboxDirFor(req.targetPath);
      mkdirSync(inboxDir, { recursive: true });
      const briefPath = join(inboxDir, BRIEF_FILENAME);
      const content = briefFrontmatter(req) + body + (body.endsWith('\n') ? '' : '\n');
      writeFileSync(briefPath, content);

      let mcpJsonWritten = false;
      if (req.figmaMcpUrl && req.figmaMcpUrl.trim().length > 0) {
        try {
          mcpJsonWritten = writeMcpJson(req.targetPath, req.figmaMcpUrl.trim());
        } catch (err) {
          return {
            ok: true,
            briefPath,
            mcpJsonWritten: false,
            reason: `Brief written; .mcp.json write failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          };
        }
      }
      return { ok: true, briefPath, mcpJsonWritten };
    },
  );

  ipcMain.handle('inbox:briefExists', async (_evt, targetPath: string): Promise<boolean> => {
    if (!targetPath) return false;
    const briefPath = join(inboxDirFor(targetPath), BRIEF_FILENAME);
    if (!existsSync(briefPath)) return false;
    try {
      return statSync(briefPath).size > 0;
    } catch {
      return false;
    }
  });

  ipcMain.handle('inbox:readDroppedFile', async (_evt, path: string): Promise<string> => {
    if (!path || !existsSync(path)) return '';
    if (statSync(path).size > MAX_BRIEF_BYTES) {
      throw new Error(`File exceeds ${MAX_BRIEF_BYTES} bytes.`);
    }
    return readFileSync(path, 'utf8');
  });
}
