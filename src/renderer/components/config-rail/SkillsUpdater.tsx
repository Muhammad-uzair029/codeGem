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

  return (
    <div className="border-t border-surface-700 pt-3 mt-3 space-y-2">
      <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Skills</div>
      <div className="text-[11px] text-neutral-500 break-all">
        github.com/Muhammad-uzair029/claude-code-boilerplate
      </div>
      {status ? (
        <div className="text-[11px] text-neutral-400">
          {status.installed
            ? `${status.count} skills · updated ${status.downloadedAt ? timeAgo(status.downloadedAt) : 'unknown'}`
            : status.skipped
              ? 'Not installed — click Update All to install'
              : 'Not installed'}
        </div>
      ) : (
        <div className="text-[11px] text-neutral-500">Checking…</div>
      )}
      <button
        className="btn-ghost text-xs flex items-center gap-1.5"
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
    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
