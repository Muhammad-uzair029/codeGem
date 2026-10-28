import { useEffect, useState } from 'react';
import { api } from '@renderer/lib/api';
import type { SkillInfo } from '@shared/ipc';

type Phase = 'loading' | 'ready' | 'installing' | 'done' | 'error';

export function Onboarding({ onDone }: { onDone: () => void }): JSX.Element {
  const [phase, setPhase] = useState<Phase>('loading');
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [installedCount, setInstalledCount] = useState(0);

  const fetchSkills = () => {
    setPhase('loading');
    setError(null);
    void api()
      .skillsRemote.fetchList()
      .then((res) => {
        if (!res.ok) {
          setError(res.reason ?? 'Failed to fetch skill list.');
          setPhase('error');
          return;
        }
        setSkills(res.skills);
        setSelected(new Set(res.skills.map((s) => s.name)));
        setPhase('ready');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Network error.');
        setPhase('error');
      });
  };

  useEffect(() => { fetchSkills(); }, []);

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const install = async () => {
    setPhase('installing');
    setError(null);
    try {
      const res = await api().skillsRemote.install([...selected]);
      if (!res.ok) {
        setError(res.reason ?? 'Install failed.');
        setPhase('error');
        return;
      }
      setInstalledCount(res.count);
      setPhase('done');
      setTimeout(() => onDone(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed.');
      setPhase('error');
    }
  };

  const skip = async () => {
    await api().skillsRemote.skip().catch(() => {});
    onDone();
  };

  return (
    <div className="flex flex-col h-screen bg-surface-950 items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="card p-8 space-y-6">
          {/* Logo / icon area */}
          <div className="flex flex-col items-center gap-3 pb-2">
            <div className="w-12 h-12 rounded-2xl bg-accent-600/20 border border-accent-600/30 flex items-center justify-center shadow-lg shadow-accent-600/10">
              <GemIcon />
            </div>
            <div className="text-center">
              <h1 className="text-lg font-semibold tracking-tight text-white">Welcome to SkillFacet</h1>
              <p className="text-sm text-neutral-400 mt-0.5">Install Claude Code skills to begin</p>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-surface-700/60" />

          {/* Loading state */}
          {phase === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="relative w-8 h-8">
                <Spinner />
              </div>
              <p className="text-sm text-neutral-400">Fetching skill list…</p>
            </div>
          )}

          {/* Ready / installing state */}
          {(phase === 'ready' || phase === 'installing') && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-400">
                  {skills.length} skills available
                </span>
                <div className="flex gap-3">
                  <button
                    className="text-xs text-neutral-500 hover:text-accent-500 transition-colors"
                    onClick={() => setSelected(new Set(skills.map((s) => s.name)))}
                    disabled={phase === 'installing'}
                  >
                    Select all
                  </button>
                  <span className="text-neutral-700">·</span>
                  <button
                    className="text-xs text-neutral-500 hover:text-accent-500 transition-colors"
                    onClick={() => setSelected(new Set())}
                    disabled={phase === 'installing'}
                  >
                    Deselect all
                  </button>
                </div>
              </div>

              <div className="space-y-1 max-h-64 overflow-y-auto -mx-1 px-1">
                {skills.map((skill) => {
                  const isChecked = selected.has(skill.name);
                  return (
                    <label
                      key={skill.name}
                      className={[
                        'flex items-start gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-all',
                        phase === 'installing' ? 'opacity-60 pointer-events-none' : '',
                        isChecked
                          ? 'bg-accent-600/10 border border-accent-600/20'
                          : 'hover:bg-surface-800 border border-transparent',
                      ].join(' ')}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        <div
                          className={[
                            'w-4 h-4 rounded flex items-center justify-center border transition-all',
                            isChecked
                              ? 'bg-accent-600 border-accent-600'
                              : 'bg-surface-800 border-surface-700',
                          ].join(' ')}
                        >
                          {isChecked && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                              <path
                                d="M1.5 5L4 7.5L8.5 2.5"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={isChecked}
                        onChange={() => toggle(skill.name)}
                        disabled={phase === 'installing'}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-neutral-100">{skill.name}</div>
                        <div className="text-xs text-neutral-500 truncate mt-0.5">{skill.description}</div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Installing progress bar */}
              {phase === 'installing' && (
                <div className="space-y-1.5">
                  <div className="h-1 w-full bg-surface-800 rounded-full overflow-hidden">
                    <div className="h-full bg-accent-600 rounded-full animate-pulse w-2/3" />
                  </div>
                  <p className="text-xs text-neutral-500 text-center">Installing skills…</p>
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  className="btn-primary"
                  onClick={install}
                  disabled={phase === 'installing' || selected.size === 0}
                >
                  {phase === 'installing' && <Spinner small />}
                  {phase === 'installing'
                    ? 'Installing…'
                    : `Install ${selected.size} skill${selected.size !== 1 ? 's' : ''}`}
                </button>
                <button
                  className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
                  onClick={skip}
                  disabled={phase === 'installing'}
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {/* Done state */}
          {phase === 'done' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-10 h-10 rounded-full bg-text-good/10 border border-text-good/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-text-good" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M5 13l4 4L19 7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-text-good">{installedCount} skills installed</p>
                <p className="text-xs text-neutral-500 mt-0.5">Entering app…</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {phase === 'error' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-text-bad/10 border border-text-bad/20 px-4 py-3">
                <p className="text-sm text-text-bad">{error}</p>
              </div>
              <div className="flex items-center gap-3">
                <button className="btn-ghost" onClick={fetchSkills}>
                  Retry
                </button>
                <button
                  className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
                  onClick={skip}
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GemIcon(): JSX.Element {
  return (
    <svg className="w-6 h-6 text-accent-500" fill="none" viewBox="0 0 24 24" strokeWidth="1.5">
      <path
        d="M12 2L2 8l10 14L22 8 12 2z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path
        d="M2 8h20M12 2L7 8l5 14 5-14-5-6z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner({ small }: { small?: boolean }): JSX.Element {
  const size = small ? 'w-3 h-3' : 'w-5 h-5';
  return (
    <svg className={`${size} animate-spin text-accent-500`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
