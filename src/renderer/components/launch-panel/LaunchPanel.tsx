import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@renderer/lib/api';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import type { LoopStage } from '@shared/ipc';

const STAGES: { id: LoopStage; label: string }[] = [
  { id: 'intake', label: 'Intake' },
  { id: 'spec', label: 'Spec' },
  { id: 'implement', label: 'Implement' },
  { id: 'verify', label: 'Verify' },
  { id: 'learn', label: 'Learn' },
];

export function LaunchPanel(): JSX.Element {
  const { targetPath, targetFramework, validation, setSkills, running, stage } = useWorkspaceStore();

  // Available skills in the cache
  const [available, setAvailable] = useState<string[]>([]);
  // Skills already in the project
  const [inProject, setInProject] = useState<Set<string>>(new Set());
  // User selection for injection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load available skills from cache
  useEffect(() => {
    void api().skills.listAvailable().then((names) => {
      setAvailable(names);
      setSelected(new Set(names)); // pre-select all
    }).catch(() => {});
  }, []);

  // Refresh project skills when target changes
  useEffect(() => {
    if (!targetPath) { setInProject(new Set()); return; }
    void api().skills.listInProject(targetPath).then((names) => {
      setInProject(new Set(names));
    }).catch(() => {});
  }, [targetPath]);

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const inject = async () => {
    if (!targetPath) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api().skills.inject({
        targetPath,
        overwrite: true,
        skills: [...selected],
        framework: targetFramework,
      });
      if (!r.ok) {
        setError(r.reason ?? 'Skill injection failed.');
        return;
      }
      setSkills(true, r.skillsCopied, r.canonicalDirsEnsured);
      // Refresh project skills list
      const updated = await api().skills.listInProject(targetPath);
      setInProject(new Set(updated));
      toast.success(`${r.skillsCopied} skills injected into project`);
    } finally {
      setBusy(false);
    }
  };

  const noneAvailable = available.length === 0;
  const projectReady = validation?.ok && !!targetPath;

  return (
    <section className="card p-4 space-y-4">
      {/* Header */}
      <div>
        <div className="text-sm font-semibold">Skills</div>
        <div className="text-xs text-neutral-400 mt-0.5">
          Select skills to inject into this project's <code>.claude/skills/</code>
        </div>
      </div>

      {/* Skill checklist */}
      {noneAvailable ? (
        <div className="text-xs text-neutral-500 italic">
          No skills in cache — use Settings → Update All to download skills first.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-[10px] text-neutral-500 mb-1">
            <span>{available.length} available</span>
            <div className="flex gap-3">
              <button className="hover:text-neutral-300 transition-colors"
                onClick={() => setSelected(new Set(available))}>All</button>
              <button className="hover:text-neutral-300 transition-colors"
                onClick={() => setSelected(new Set())}>None</button>
            </div>
          </div>

          <div className="space-y-0.5 max-h-52 overflow-y-auto rounded-lg border border-surface-700 bg-surface-800/40">
            {available.map((name) => {
              const isIn = inProject.has(name);
              const isSel = selected.has(name);
              return (
                <label
                  key={name}
                  className={`flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors ${
                    isSel ? 'bg-accent-600/10' : 'hover:bg-surface-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-violet-500 shrink-0"
                    checked={isSel}
                    onChange={() => toggle(name)}
                    disabled={busy}
                  />
                  <span className="text-xs text-neutral-200 flex-1 truncate">{name}</span>
                  {isIn && (
                    <span className="text-[10px] text-green-500 shrink-0">✓ in project</span>
                  )}
                </label>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn-primary text-xs py-1.5"
              onClick={inject}
              disabled={!projectReady || busy || running || selected.size === 0}
            >
              {busy
                ? 'Injecting…'
                : `Inject ${selected.size} skill${selected.size !== 1 ? 's' : ''}`}
            </button>
            {!projectReady && (
              <span className="text-[11px] text-neutral-500">Select a valid project first</span>
            )}
          </div>
        </>
      )}

      {error && <div className="text-xs text-bad" role="alert">{error}</div>}

      {/* Stage indicator */}
      <div>
        <div className="field-label mb-2">Stage</div>
        <ol className="flex flex-wrap items-center gap-1.5 text-[10px]">
          {STAGES.map((s, i) => {
            const idx = STAGES.findIndex((x) => x.id === stage);
            const isActive = stage === s.id;
            const isDone = idx >= 0 && i < idx;
            return (
              <li
                key={s.id}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${
                  isActive
                    ? 'border-accent-500 bg-accent-500/15 text-white'
                    : isDone
                      ? 'border-good/40 text-good'
                      : 'border-surface-700 text-neutral-400'
                }`}
              >
                <span
                  aria-hidden
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    isActive ? 'bg-accent-500' : isDone ? 'bg-good' : 'bg-surface-600'
                  }`}
                />
                {s.label}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
