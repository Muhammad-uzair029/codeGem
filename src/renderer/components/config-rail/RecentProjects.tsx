import { useEffect, useRef, useState } from 'react';
import { api } from '@renderer/lib/api';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import type { PersistentConfig } from '@shared/ipc';

type HistoryEntry = PersistentConfig['history'][number];

export function RecentProjects(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { setTargetPath, setValidation, setFramework, targetPath } = useWorkspaceStore();

  useEffect(() => {
    void api()
      .state.read()
      .then((cfg) => setHistory(cfg.history ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const pick = async (entry: HistoryEntry) => {
    setOpen(false);
    setBusy(true);
    try {
      setTargetPath(entry.active_project_path, entry.project_type);
      const [v, det] = await Promise.all([
        api().workspace.validateExisting(entry.active_project_path),
        api().workspace.detectFramework(entry.active_project_path),
      ]);
      setValidation({ ok: v.ok, hasGit: v.hasGit, hasPackageJson: v.hasPackageJson, hasClaudeDir: v.hasClaudeDir, reason: v.reason });
      setFramework(det.framework, det.signals);
      if (v.ok) {
        void api().state.setActive({
          active_project_path: entry.active_project_path,
          project_type: entry.project_type,
          target_framework: det.framework,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  if (history.length === 0) return <></>;

  return (
    <div className="shrink-0 px-3 pt-2 pb-1" ref={ref}>
      <button
        className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg bg-surface-800 hover:bg-surface-700 transition-colors text-xs text-neutral-300 border border-surface-700"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-haspopup="listbox"
        aria-expanded={open}
        id="recent-projects-btn"
      >
        <span className="truncate">
          {busy ? 'Loading…' : targetPath ? shortPath(targetPath) : 'Recent projects ▾'}
        </span>
        <span className="ml-2 text-neutral-500 shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-labelledby="recent-projects-btn"
          className="mt-1 rounded-lg border border-surface-700 bg-surface-900 shadow-xl z-50 overflow-hidden max-h-56 overflow-y-auto"
        >
          {history.map((h) => (
            <button
              key={h.active_project_path}
              role="option"
              aria-selected={h.active_project_path === targetPath}
              className="w-full text-left px-3 py-2 text-xs hover:bg-surface-700 transition-colors border-b border-surface-800 last:border-0"
              onClick={() => void pick(h)}
            >
              <div className="font-mono truncate text-neutral-200">{shortPath(h.active_project_path)}</div>
              <div className="text-[10px] text-neutral-500 mt-0.5">
                {h.project_type} · {h.target_framework ?? 'unknown'} · {formatDate(h.last_used_at)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function shortPath(p: string): string {
  const home = '~';
  const parts = p.replace(/^\/Users\/[^/]+/, home).split('/');
  if (parts.length <= 3) return parts.join('/');
  return `${parts.slice(0, 2).join('/')}/…/${parts[parts.length - 1]}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}
