import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@renderer/lib/api';
import type { SkillsCacheStatus } from '@shared/ipc';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

export function SkillsUpdater(): JSX.Element {
  const [status, setStatus] = useState<SkillsCacheStatus | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    void api()
      .skillsRemote.status()
      .then(setStatus)
      .catch(() => {});
  }, []);

  const update = async () => {
    setUpdating(true);
    try {
      const res = await api().skillsRemote.installAll();
      if (!res.ok) {
        toast.error(res.reason ?? 'Update failed.');
        return;
      }
      toast.success(`${res.count} skills updated`);
      const fresh = await api().skillsRemote.status();
      setStatus(fresh);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setUpdating(false);
    }
  };

  const isInstalled = status?.installed === true;
  const isNotInstalled = status !== null && !status.installed;

  return (
    <div className="border-t border-surface-700/60 pt-3 mt-3 space-y-2.5">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">
          Skills
        </span>
        <div className="flex-1 h-px bg-surface-700/60" />
      </div>

      {/* Repo label */}
      <div className="text-[11px] text-neutral-600 font-mono truncate leading-none">
        github.com/Muhammad-uzair029/claude-code-boilerplate
      </div>

      {/* Status row */}
      <div className="flex items-center gap-2">
        {status === null ? (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-600 animate-pulse" />
            <span className="text-[11px] text-neutral-500">Checking…</span>
          </>
        ) : isInstalled ? (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-text-good" />
            <span className="text-[11px] text-neutral-400">
              {status.count} skills
              {status.downloadedAt && (
                <> · <span className="text-neutral-500">{timeAgo(status.downloadedAt)}</span></>
              )}
            </span>
          </>
        ) : isNotInstalled ? (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-600" />
            <span className="text-[11px] text-neutral-500">
              {status.skipped ? 'Not installed — update to install' : 'Not installed'}
            </span>
          </>
        ) : null}
      </div>

      {/* Update button */}
      <button
        className="btn-ghost text-xs py-1 px-2.5"
        onClick={update}
        disabled={updating}
      >
        {updating && <SmallSpinner />}
        {updating ? 'Updating…' : 'Update All'}
      </button>
    </div>
  );
}

function SmallSpinner(): JSX.Element {
  return (
    <svg className="w-3 h-3 animate-spin text-accent-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
