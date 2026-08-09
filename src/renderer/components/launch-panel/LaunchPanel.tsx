import { useState } from 'react';
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
  const { targetPath, validation, skillsInjected, skillsCopiedCount, canonicalDirsEnsured, setSkills, running, stage } =
    useWorkspaceStore();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inject = async () => {
    if (!targetPath) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api().skills.inject({ targetPath, overwrite: true });
      if (!r.ok) {
        setError(r.reason ?? 'Skill injection failed.');
        setSkills(false, 0, []);
        return;
      }
      setSkills(true, r.skillsCopied, r.canonicalDirsEnsured);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-4 space-y-3">
      <header>
        <div className="text-sm font-semibold">3 · Inject skills</div>
        <div className="text-xs text-neutral-400">
          Copies skill matrix + <code>CLAUDE.md</code> into the target project.
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn-ghost"
          onClick={inject}
          disabled={!validation?.ok || busy || running}
        >
          {skillsInjected ? `Re-inject (${skillsCopiedCount})` : 'Inject skills + CLAUDE.md'}
        </button>
        {skillsInjected && (
          <>
            <span className="pill">
              <span className="text-good">●</span> {skillsCopiedCount} copied
            </span>
            {canonicalDirsEnsured.length > 0 && (
              <span className="pill text-[10px]">
                <span className="text-good">●</span> {canonicalDirsEnsured.join(', ')}
              </span>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="text-xs text-bad" role="alert">{error}</div>
      )}

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
