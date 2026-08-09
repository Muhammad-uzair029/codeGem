import { useState } from 'react';
import { api } from '@renderer/lib/api';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';

export function StickyLaunchBar(): JSX.Element {
  const { targetPath, validation, brief, briefWritten, skillsInjected, running, sessionId, setSession, setStage } =
    useWorkspaceStore();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const figmaMcpMissing = brief.figmaUrl.trim().length > 0 && brief.figmaMcpUrl.trim().length === 0;

  const canLaunch =
    Boolean(targetPath && validation?.ok) &&
    briefWritten &&
    skillsInjected &&
    !figmaMcpMissing &&
    !running;

  const gateReason = !targetPath || !validation?.ok
    ? 'Select a valid project first.'
    : !briefWritten
      ? 'Write the feature brief first.'
      : !skillsInjected
        ? 'Inject skills first.'
        : figmaMcpMissing
          ? 'Figma MCP URL required when a design URL is provided.'
          : '';

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
    <div className="shrink-0 px-3 py-3 border-t border-surface-800 bg-[#0b0d10]">
      <div className="flex items-center gap-2">
        <button
          className="btn-primary flex-1"
          onClick={running ? stop : launch}
          disabled={busy || (!canLaunch && !running)}
          title={gateReason}
          data-testid="launch-btn"
        >
          {running ? 'Stop loop' : 'Launch Autonomous Loop'}
        </button>
      </div>
      {error && (
        <div className="mt-1 text-[11px] text-bad" role="alert">{error}</div>
      )}
      {!canLaunch && !running && gateReason && (
        <div className="mt-1 text-[11px] text-neutral-500">{gateReason}</div>
      )}
    </div>
  );
}
