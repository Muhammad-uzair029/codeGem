import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@renderer/lib/api';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import type { IsolationInfo, LaunchResult, RunRecord } from '@shared/ipc';

type Notice = { tone: 'warn' | 'info'; text: string };

// Mirrors isResumable() in main/services/loopHelpers (which pulls in
// node:fs, so the renderer can't import it).
const canResume = (run: RunRecord | null): run is RunRecord =>
  !!run && (run.status === 'failed' || run.status === 'stopped');

function noticeFor(iso: IsolationInfo | undefined, requested: boolean): Notice | null {
  if (!iso) return null;
  if (iso.isolated && iso.dirty) {
    return {
      tone: 'warn',
      text: `Uncommitted changes are not included in the isolated run (${iso.uncommitted.length} file${
        iso.uncommitted.length === 1 ? '' : 's'
      }). Commit them first if the loop needs them.`,
    };
  }
  if (!iso.isolated && requested) {
    return { tone: 'info', text: `Running in place: ${iso.reason ?? 'worktree isolation unavailable'}.` };
  }
  return null;
}

export function StickyLaunchBar(): JSX.Element {
  const { targetPath, validation, brief, briefWritten, skillsInjected, running, sessionId, setSession, setStage } =
    useWorkspaceStore();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isolate, setIsolate] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [review, setReview] = useState<string[] | null>(null);
  const [lastRun, setLastRun] = useState<RunRecord | null>(null);
  const launchRef = useRef<() => void>(() => {});
  const targetRef = useRef(targetPath);

  useEffect(() => {
    launchRef.current = () => { if (canLaunch) void launch(); };
  });

  useEffect(() => {
    const handler = () => launchRef.current();
    window.addEventListener('flm:launch', handler);
    return () => window.removeEventListener('flm:launch', handler);
  }, []);

  // Persisted isolation preference (absent = on).
  useEffect(() => {
    void api().state.read().then((cfg) => setIsolate(cfg.isolate_runs !== false)).catch(() => {});
  }, []);

  // Latest run for this project drives the Resume button.
  useEffect(() => {
    targetRef.current = targetPath;
    setNotice(null);
    setReview(null);
    setLastRun(null);
    if (!targetPath) return;
    void api().loop.latestRun(targetPath).then((r) => {
      if (targetRef.current === targetPath) setLastRun(r);
    }).catch(() => {});
  }, [targetPath]);

  useEffect(() => {
    return api().loop.onExit((evt) => {
      if (!evt.run || evt.run.targetPath !== targetRef.current) return;
      setLastRun(evt.run);
      if (evt.review) setReview(evt.review);
    });
  }, []);

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

  const showResume = canResume(lastRun) && !running && Boolean(targetPath && validation?.ok);

  const onStarted = (r: LaunchResult, requestedIsolation: boolean, label: string): boolean => {
    if (!r.ok || !r.sessionId) {
      setError(r.reason ?? 'Launch failed.');
      setSession(null, false);
      return false;
    }
    setSession(r.sessionId, true);
    setStage('unknown');
    setReview(null);
    setNotice(noticeFor(r.isolation, requestedIsolation));
    if (r.run) setLastRun(r.run);
    toast.success(label);
    return true;
  };

  const launch = async () => {
    if (!canLaunch) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api().loop.launch({ targetPath, forceAutonomous: true, isolate });
      onStarted(r, isolate, r.isolation?.isolated ? 'Feature loop launched in a worktree' : 'Feature loop launched');
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    if (!canResume(lastRun) || running) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api().loop.launch({ targetPath, forceAutonomous: true, resumeRunId: lastRun.id });
      onStarted(r, false, 'Feature loop resumed');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!sessionId) return;
    await api().loop.stop(sessionId);
    setSession(null, false);
    toast.info('Loop stopped');
  };

  const toggleIsolate = (on: boolean) => {
    setIsolate(on);
    void api().state.setIsolateRuns(on).catch(() => {});
  };

  return (
    <div className="shrink-0 px-3 py-3 border-t border-surface-800 bg-[#0b0d10]">
      <label
        className="flex items-center gap-2 mb-2 text-[11px] text-neutral-400 cursor-pointer select-none"
        title="Run the loop on a new branch in .claude/worktrees/ so your working folder stays untouched."
      >
        <input
          type="checkbox"
          className="accent-violet-500"
          checked={isolate}
          onChange={(e) => toggleIsolate(e.target.checked)}
          disabled={running || busy}
          data-testid="isolate-toggle"
        />
        Isolate runs in a git worktree
      </label>

      {showResume && (
        <button
          className="btn-ghost w-full justify-center mb-2 text-xs"
          onClick={resume}
          disabled={busy}
          title={`Re-launch in ${lastRun.cwd}`}
          data-testid="resume-run"
        >
          Resume {lastRun.status} run · {lastRun.lastStage === 'unknown' ? 'start' : lastRun.lastStage} ·{' '}
          {new Date(lastRun.endedAt ?? lastRun.startedAt).toLocaleString()}
        </button>
      )}

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
      {notice && (
        <div
          className={`mt-2 text-[11px] ${notice.tone === 'warn' ? 'text-warn' : 'text-neutral-400'}`}
          role="status"
          data-testid="isolation-notice"
        >
          {notice.text}
        </div>
      )}
      {review && <ReviewBox lines={review} onDismiss={() => setReview(null)} />}
    </div>
  );
}

function ReviewBox({ lines, onDismiss }: { lines: string[]; onDismiss: () => void }): JSX.Element {
  return (
    <div className="mt-2 rounded-lg border border-surface-700 bg-surface-800/40 p-2" data-testid="worktree-review">
      <div className="flex items-center justify-between mb-1 text-[11px] text-neutral-300">
        <span>Run finished in a worktree</span>
        <div className="flex gap-2 text-[10px] text-neutral-500">
          <button className="hover:text-neutral-300" onClick={() => void navigator.clipboard.writeText(lines.join('\n'))}>
            Copy
          </button>
          <button className="hover:text-neutral-300" onClick={onDismiss}>Dismiss</button>
        </div>
      </div>
      <pre className="text-[10px] leading-snug text-neutral-400 whitespace-pre-wrap break-all font-mono">
        {lines.join('\n')}
      </pre>
    </div>
  );
}
