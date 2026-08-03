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
  const {
    targetPath,
    validation,
    brief,
    briefWritten,
    skillsInjected,
    skillsCopiedCount,
    canonicalDirsEnsured,
    setSkills,
    setSession,
    setStage,
    stage,
    running,
    sessionId,
  } = useWorkspaceStore();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const figmaMcpMissing =
    brief.figmaUrl.trim().length > 0 && brief.figmaMcpUrl.trim().length === 0;

  const canLaunch =
    Boolean(targetPath && validation?.ok) &&
    briefWritten &&
    skillsInjected &&
    !figmaMcpMissing &&
    !running;

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

  const launch = async () => {
    if (!canLaunch) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api().loop.launch({ targetPath, forceAutonomous: true });
      if (!r.ok || !r.sessionId) {
        setError(r.reason ?? 'Launch failed.');
        setSession(null, false);
        return;
      }
      setSession(r.sessionId, true);
      setStage('unknown');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!sessionId) return;
    await api().loop.stop(sessionId);
    setSession(null, false);
  };

  return (
    <section className="card p-5 space-y-4">
      <header>
        <div className="text-sm font-semibold">3 · Inject skills + launch loop</div>
        <div className="text-xs text-neutral-400">
          Skill matrix + <code>CLAUDE.md</code> are copied into the target project. Then
          <code> claude /feature-loop --force-autonomous</code> runs inside that path.
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn-ghost"
          onClick={inject}
          disabled={!validation?.ok || busy || running}
        >
          {skillsInjected ? `Re-inject skills (${skillsCopiedCount})` : 'Inject skills + CLAUDE.md'}
        </button>
        {skillsInjected && (
          <>
            <span className="pill">
              <span className="text-good">●</span> {skillsCopiedCount} skills copied
            </span>
            {canonicalDirsEnsured.length > 0 && (
              <span className="pill">
                <span className="text-good">●</span> canonical: {canonicalDirsEnsured.join(', ')}
              </span>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn-primary"
          onClick={launch}
          disabled={!canLaunch || busy}
          title={
            !briefWritten
              ? 'Write the feature brief first.'
              : !skillsInjected
                ? 'Inject skills first.'
                : figmaMcpMissing
                  ? 'Figma MCP URL required when a design URL is provided.'
                  : ''
          }
        >
          {running ? 'Loop running…' : 'Launch Autonomous Feature Loop'}
        </button>
        {running && (
          <button className="btn-ghost" onClick={stop}>
            Stop
          </button>
        )}
        {error && (
          <span className="text-xs text-bad" role="alert">
            {error}
          </span>
        )}
      </div>

      <div className="pt-2">
        <div className="field-label mb-2">Stage</div>
        <ol className="flex items-center gap-2 text-[11px]">
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
