import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@renderer/lib/api';
import type { SkillInfo, SkillsCacheStatus } from '@shared/ipc';

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
  const [remoteSkills, setRemoteSkills] = useState<SkillInfo[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [busySkill, setBusySkill] = useState<string | null>(null);

  const refreshStatus = async () => {
    const s = await api().skillsRemote.status();
    setStatus(s);
    return s;
  };

  const loadRemoteList = async () => {
    setLoadingRemote(true);
    try {
      const res = await api().skillsRemote.fetchList();
      if (res.ok) setRemoteSkills(res.skills);
    } catch {/* ignore */}
    finally { setLoadingRemote(false); }
  };

  useEffect(() => {
    void refreshStatus();
    void loadRemoteList();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateAll = async () => {
    setUpdating(true);
    try {
      const res = await api().skillsRemote.installAll();
      if (!res.ok) { toast.error(res.reason ?? 'Update failed.'); return; }
      toast.success(`${res.count} skills updated`);
      await refreshStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setUpdating(false);
    }
  };

  const installSkill = async (name: string) => {
    setBusySkill(name);
    try {
      const current = status?.skills ?? [];
      const next = [...new Set([...current, name])];
      const res = await api().skillsRemote.install(next);
      if (!res.ok) { toast.error(res.reason ?? `Failed to install ${name}`); return; }
      toast.success(`${name} installed`);
      await refreshStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Install failed.');
    } finally {
      setBusySkill(null);
    }
  };

  const uninstallSkill = async (name: string) => {
    setBusySkill(name);
    try {
      const current = status?.skills ?? [];
      const next = current.filter((s) => s !== name);
      const res = await api().skillsRemote.install(next);
      if (!res.ok) { toast.error(res.reason ?? `Failed to remove ${name}`); return; }
      toast.success(`${name} removed`);
      await refreshStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Uninstall failed.');
    } finally {
      setBusySkill(null);
    }
  };

  const installAll = async () => {
    setUpdating(true);
    try {
      const res = await api().skillsRemote.installAll();
      if (!res.ok) { toast.error(res.reason ?? 'Install all failed.'); return; }
      toast.success(`${res.count} skills installed`);
      await refreshStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Install all failed.');
    } finally {
      setUpdating(false);
    }
  };

  const removeAll = async () => {
    setUpdating(true);
    try {
      const res = await api().skillsRemote.install([]);
      if (!res.ok) { toast.error(res.reason ?? 'Remove all failed.'); return; }
      toast.success('All skills removed');
      await refreshStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Remove all failed.');
    } finally {
      setUpdating(false);
    }
  };

  const installedSet = new Set(status?.skills ?? []);

  // Merge: remote list is authoritative; fall back to installed list if remote not loaded yet
  const allSkills: string[] = remoteSkills.length > 0
    ? remoteSkills.map((s) => s.name)
    : [...installedSet];

  const descriptionOf = (name: string) =>
    remoteSkills.find((s) => s.name === name)?.description ?? '';

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">Skills</span>
        <div className="flex-1 h-px bg-surface-700/60" />
      </div>

      {/* Source + status */}
      <div className="space-y-1">
        <div className="text-[11px] text-neutral-600 font-mono truncate">
          {status?.source ?? 'codeGem skills site'}
        </div>
        <div className="flex items-center gap-2">
          {status === null ? (
            <><span className="w-1.5 h-1.5 rounded-full bg-neutral-600 animate-pulse inline-block" /><span className="text-[11px] text-neutral-500">Checking…</span></>
          ) : status.installed ? (
            <><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /><span className="text-[11px] text-neutral-400">{status.count} installed{status.downloadedAt && <> · {timeAgo(status.downloadedAt)}</>}</span></>
          ) : (
            <><span className="w-1.5 h-1.5 rounded-full bg-neutral-600 inline-block" /><span className="text-[11px] text-neutral-500">{status.skipped ? 'Not installed' : 'Not installed'}</span></>
          )}
        </div>
      </div>

      {/* Skills list */}
      <div className="rounded-lg border border-surface-700 bg-surface-800/40 overflow-hidden">
        {loadingRemote && allSkills.length === 0 ? (
          <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-neutral-500">
            <SmallSpinner /> Loading skills…
          </div>
        ) : allSkills.length === 0 ? (
          <div className="px-3 py-3 text-[11px] text-neutral-500">No skills found.</div>
        ) : (
          <div className="divide-y divide-surface-700/60 max-h-64 overflow-y-auto">
            {allSkills.map((name) => {
              const installed = installedSet.has(name);
              const busy = busySkill === name;
              return (
                <div key={name} className="flex items-center gap-2 px-3 py-2">
                  {/* Status dot */}
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${installed ? 'bg-green-500' : 'bg-neutral-600'}`} />

                  {/* Name + description */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-neutral-200 truncate">{name}</div>
                    {descriptionOf(name) && (
                      <div className="text-[10px] text-neutral-500 truncate">{descriptionOf(name)}</div>
                    )}
                  </div>

                  {/* Action button */}
                  <button
                    className={`shrink-0 text-[10px] px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${
                      installed
                        ? 'border-surface-600 text-neutral-400 hover:border-red-500/50 hover:text-red-400'
                        : 'border-accent-600/50 text-accent-400 hover:border-accent-500 hover:bg-accent-600/10'
                    } disabled:opacity-40`}
                    onClick={() => installed ? uninstallSkill(name) : installSkill(name)}
                    disabled={busy || updating}
                  >
                    {busy && <SmallSpinner />}
                    {busy ? '…' : installed ? 'Remove' : 'Install'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bulk action buttons */}
      <div className="flex gap-2">
        <button
          className="btn-ghost text-xs py-1 px-2.5 flex-1 justify-center"
          onClick={installAll}
          disabled={updating || busySkill !== null}
          title="Download and install all skills"
        >
          {updating && <SmallSpinner />}
          {updating ? '…' : 'Install All'}
        </button>
        <button
          className="btn-ghost text-xs py-1 px-2.5 flex-1 justify-center"
          onClick={updateAll}
          disabled={updating || busySkill !== null}
          title="Re-download all installed skills from latest"
        >
          {updating && <SmallSpinner />}
          {updating ? '…' : 'Update All'}
        </button>
        <button
          className="text-xs py-1 px-2.5 rounded-lg border border-surface-700 text-neutral-500 hover:border-red-500/40 hover:text-red-400 transition-colors disabled:opacity-40"
          onClick={removeAll}
          disabled={updating || busySkill !== null || !status?.installed}
          title="Remove all installed skills"
        >
          Remove All
        </button>
      </div>
    </div>
  );
}

function SmallSpinner(): JSX.Element {
  return (
    <svg className="w-3 h-3 animate-spin text-accent-500 shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
