import { useCallback, useState } from 'react';
import { api } from '@renderer/lib/api';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';

interface DroppedFile {
  path: string;
  name: string;
}

export function BriefIntake(): JSX.Element {
  const { targetPath, validation, brief, setBrief, setBriefWritten, briefWritten } =
    useWorkspaceStore();

  const enabled = Boolean(targetPath && validation?.ok);

  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDrop, setLastDrop] = useState<DroppedFile | null>(null);

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      if (!enabled) return;
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      const first = files[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (first as any).path as string | undefined;
      if (!p) {
        setError('Could not read the dropped file path.');
        return;
      }
      try {
        const content = await api().inbox.readDroppedFile(p);
        setBrief({ markdown: content });
        setLastDrop({ path: p, name: first.name });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [enabled, setBrief],
  );

  const write = async () => {
    if (!enabled) return;
    setError(null);
    if (!brief.markdown.trim()) {
      setError('Feature brief is required — paste or drop a markdown doc.');
      return;
    }
    setBusy(true);
    try {
      const r = await api().inbox.writeBrief({
        targetPath,
        briefMarkdown: brief.markdown,
        figmaUrl: brief.figmaUrl.trim() || undefined,
        figmaMcpUrl: brief.figmaMcpUrl.trim() || undefined,
      });
      if (!r.ok) {
        setError(r.reason ?? 'Write failed.');
        setBriefWritten(false);
        return;
      }
      setBriefWritten(true);
    } finally {
      setBusy(false);
    }
  };

  const figmaMcpRequired = brief.figmaUrl.trim().length > 0;
  const figmaMcpMissing = figmaMcpRequired && brief.figmaMcpUrl.trim().length === 0;

  return (
    <section className="card p-5 space-y-4">
      <header>
        <div className="text-sm font-semibold">
          2 · Feature brief <span className="text-bad">*</span>
        </div>
        <div className="text-xs text-neutral-400">
          Required. Drop a markdown doc or paste it below. Figma link + MCP URL land in
          <code> .mcp.json</code> and the brief frontmatter automatically.
        </div>
      </header>

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          if (enabled) setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border border-dashed p-4 text-xs transition ${
          !enabled
            ? 'border-surface-700 text-neutral-500'
            : dragging
              ? 'border-accent-500 bg-accent-500/5 text-neutral-100'
              : 'border-surface-600 text-neutral-300'
        }`}
        aria-disabled={!enabled}
      >
        {enabled ? (
          <div className="flex items-center justify-between gap-3">
            <span>
              Drop a <code>.md</code> file here to load it as the feature brief.
            </span>
            {lastDrop && (
              <span className="pill">
                <span className="text-good">●</span> {lastDrop.name}
              </span>
            )}
          </div>
        ) : (
          <span>Select a project first.</span>
        )}
      </div>

      <div>
        <div className="field-label mb-1">Brief markdown</div>
        <textarea
          className="field-input h-40 font-mono text-xs resize-y"
          placeholder="# Feature: ...&#10;&#10;## Goals&#10;- ..."
          value={brief.markdown}
          onChange={(e) => setBrief({ markdown: e.target.value })}
          disabled={!enabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="field-label mb-1">Figma design URL (optional)</div>
          <input
            className="field-input font-mono text-xs"
            placeholder="https://www.figma.com/design/<key>/…?node-id=1-2"
            value={brief.figmaUrl}
            onChange={(e) => setBrief({ figmaUrl: e.target.value })}
            disabled={!enabled}
          />
        </div>
        <div>
          <div className="field-label mb-1">
            Figma MCP URL {figmaMcpRequired ? <span className="text-bad">*</span> : null}
          </div>
          <input
            className="field-input font-mono text-xs"
            placeholder="http://127.0.0.1:3845/sse"
            value={brief.figmaMcpUrl}
            onChange={(e) => setBrief({ figmaMcpUrl: e.target.value })}
            disabled={!enabled}
            aria-invalid={figmaMcpMissing}
          />
          {figmaMcpMissing && (
            <div className="mt-1 text-[11px] text-warn">
              Required whenever a Figma design URL is set — the spec-writer talks to
              Figma through this MCP endpoint.
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="btn-primary"
          disabled={!enabled || busy || !brief.markdown.trim() || figmaMcpMissing}
          onClick={write}
        >
          Write feature-brief.md
        </button>
        {briefWritten && <span className="text-xs text-good">Brief written.</span>}
        {error && (
          <span className="text-xs text-bad" role="alert">
            {error}
          </span>
        )}
      </div>
    </section>
  );
}
