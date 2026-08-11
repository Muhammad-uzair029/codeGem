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
    <div className="flex flex-col h-screen bg-[#0b0d10] text-neutral-100 items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Welcome to codeGem</h1>
          <p className="text-sm text-neutral-400 mt-1">Install Claude Code skills to begin</p>
        </div>

        {phase === 'loading' && (
          <div className="flex items-center gap-3 text-sm text-neutral-400">
            <Spinner />
            Fetching skill list…
          </div>
        )}

        {(phase === 'ready' || phase === 'installing') && (
          <>
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>{skills.length} skills available</span>
              <div className="flex gap-3">
                <button
                  className="hover:text-neutral-300 transition-colors"
                  onClick={() => setSelected(new Set(skills.map((s) => s.name)))}
                >
                  Select all
                </button>
                <button
                  className="hover:text-neutral-300 transition-colors"
                  onClick={() => setSelected(new Set())}
                >
                  Deselect all
                </button>
              </div>
            </div>

            <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
              {skills.map((skill) => (
                <label
                  key={skill.name}
                  className="flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-surface-800 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-violet-500"
                    checked={selected.has(skill.name)}
                    onChange={() => toggle(skill.name)}
                    disabled={phase === 'installing'}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{skill.name}</div>
                    <div className="text-xs text-neutral-400 truncate">{skill.description}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <button
                className="btn-primary flex items-center gap-2"
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
                Skip for now →
              </button>
            </div>
          </>
        )}

        {phase === 'done' && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <span>✓</span>
            {installedCount} skills installed — entering app…
          </div>
        )}

        {phase === 'error' && (
          <div className="space-y-3">
            <div className="text-sm text-red-400">{error}</div>
            <div className="flex items-center gap-4">
              <button className="btn-ghost" onClick={fetchSkills}>
                Retry
              </button>
              <button
                className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
                onClick={skip}
              >
                Skip for now →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner({ small }: { small?: boolean }): JSX.Element {
  const size = small ? 'w-3 h-3' : 'w-4 h-4';
  return (
    <svg className={`${size} animate-spin text-violet-400`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
