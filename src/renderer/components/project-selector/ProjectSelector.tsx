import { useEffect, useState } from 'react';
import { api } from '@renderer/lib/api';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import type { ProjectType, TargetFramework } from '@shared/ipc';
import { STACK_PRESETS } from '@shared/stacks';

async function persistActive(
  path: string,
  projectType: ProjectType,
  framework: TargetFramework | null,
): Promise<void> {
  try {
    await api().state.setActive({
      active_project_path: path,
      project_type: projectType,
      target_framework: framework,
    });
  } catch {
    /* config write is best-effort; UI stays functional even if it fails */
  }
}

export function ProjectSelector(): JSX.Element {
  const {
    mode,
    setMode,
    targetPath,
    setTargetPath,
    validation,
    setValidation,
    parentDir,
    setParentDir,
    projectName,
    setProjectName,
    targetFramework,
    frameworkSignals,
    setFramework,
    projectType,
  } = useWorkspaceStore();

  const [busy, setBusy] = useState(false);
  const [scaffoldError, setScaffoldError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'new' && !parentDir) {
      void api()
        .workspace.defaultParentDir()
        .then((d) => setParentDir(d))
        .catch(() => {});
    }
  }, [mode, parentDir, setParentDir]);

  const runFrameworkDetection = async (
    path: string,
    projectTypeForPersist: ProjectType,
  ): Promise<void> => {
    try {
      const det = await api().workspace.detectFramework(path);
      setFramework(det.framework, det.signals);
      await persistActive(path, projectTypeForPersist, det.framework);
    } catch {
      setFramework(null, []);
    }
  };

  // Manual stack pick overrides detection; persisted so skill injection
  // writes the matching CLAUDE.md template.
  const pickStack = async (value: string): Promise<void> => {
    const framework: TargetFramework | null = STACK_PRESETS.find((p) => p.id === value)?.id ?? null;
    setFramework(framework, frameworkSignals);
    if (targetPath && projectType) {
      await persistActive(targetPath, projectType, framework);
    }
  };

  const pickExisting = async () => {
    setBusy(true);
    try {
      const p = await api().workspace.pickExistingDir();
      if (!p) return;
      setTargetPath(p, 'EXISTING_LEGACY');
      const v = await api().workspace.validateExisting(p);
      setValidation({
        ok: v.ok,
        hasGit: v.hasGit,
        hasPackageJson: v.hasPackageJson,
        hasClaudeDir: v.hasClaudeDir,
        reason: v.reason,
      });
      if (v.ok) {
        await runFrameworkDetection(p, 'EXISTING_LEGACY');
      }
    } finally {
      setBusy(false);
    }
  };

  const pickParent = async () => {
    setBusy(true);
    try {
      const p = await api().workspace.pickParentDir();
      if (p) setParentDir(p);
    } finally {
      setBusy(false);
    }
  };

  const scaffoldNew = async () => {
    setScaffoldError(null);
    if (!parentDir || !projectName) {
      setScaffoldError('Parent directory and project name are required.');
      return;
    }
    setBusy(true);
    try {
      const r = await api().workspace.scaffoldNew({ parentDir, projectName });
      if (!r.ok) {
        setScaffoldError(r.reason ?? 'Scaffold failed.');
        return;
      }
      setTargetPath(r.path, 'NEW_SCAFFOLD');
      const v = await api().workspace.validateExisting(r.path);
      setValidation({
        ok: v.ok,
        hasGit: v.hasGit,
        hasPackageJson: v.hasPackageJson,
        hasClaudeDir: v.hasClaudeDir,
        reason: v.reason,
      });
      if (v.ok) {
        await runFrameworkDetection(r.path, 'NEW_SCAFFOLD');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">1 · Project</div>
          <div className="text-xs text-neutral-400">
            Choose an existing project or scaffold a new one. State persists in
            <code> config.json</code>.
          </div>
        </div>
        <div
          role="tablist"
          aria-label="Workspace mode"
          className="inline-flex rounded-lg border border-surface-700 p-0.5 bg-surface-800"
        >
          <button
            role="tab"
            aria-selected={mode === 'existing'}
            className={`px-3 py-1 text-xs rounded-md ${
              mode === 'existing' ? 'bg-accent-600 text-white' : 'text-neutral-300'
            }`}
            onClick={() => setMode('existing')}
          >
            Existing
          </button>
          <button
            role="tab"
            aria-selected={mode === 'new'}
            className={`px-3 py-1 text-xs rounded-md ${
              mode === 'new' ? 'bg-accent-600 text-white' : 'text-neutral-300'
            }`}
            onClick={() => setMode('new')}
          >
            New
          </button>
        </div>
      </header>

      {mode === 'existing' ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              readOnly
              className="field-input font-mono text-xs"
              placeholder="/absolute/path/to/existing/project"
              value={targetPath}
              aria-label="Existing project absolute path"
            />
            <button className="btn-ghost" disabled={busy} onClick={pickExisting}>
              Browse…
            </button>
          </div>
          {validation && (
            <div className="text-xs space-y-1" role="status" aria-live="polite">
              <ValidationRow label=".git" ok={validation.hasGit} />
              <ValidationRow label="package.json" ok={validation.hasPackageJson} />
              <ValidationRow label=".claude/ (existing skills)" ok={validation.hasClaudeDir} soft />
              {!validation.ok && (
                <div className="text-bad">
                  {validation.reason ?? 'Not a valid project directory.'}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <div className="field-label mb-1">Parent directory</div>
              <input
                className="field-input font-mono text-xs"
                placeholder="~/Desktop"
                value={parentDir}
                onChange={(e) => setParentDir(e.target.value)}
                aria-label="Parent directory for the new project"
              />
            </div>
            <div className="self-end">
              <button className="btn-ghost" disabled={busy} onClick={pickParent}>
                Browse…
              </button>
            </div>
          </div>
          <div>
            <div className="field-label mb-1">Project name</div>
            <input
              className="field-input font-mono text-xs"
              placeholder="my-new-project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              aria-label="New project name (kebab-case)"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-primary"
              disabled={busy || !parentDir || !projectName}
              onClick={scaffoldNew}
            >
              Create project + git init
            </button>
            {scaffoldError && (
              <span className="text-xs text-bad" role="alert">
                {scaffoldError}
              </span>
            )}
          </div>
          {targetPath && validation?.ok && (
            <div className="text-xs text-good">Created at {targetPath}</div>
          )}
        </div>
      )}

      {targetPath && validation?.ok && (
        <div className="pt-2 border-t border-surface-800 flex flex-wrap items-center gap-2 text-xs">
          <span className="pill">
            {projectType === 'NEW_SCAFFOLD' ? 'NEW_SCAFFOLD' : 'EXISTING_LEGACY'}
          </span>
          <label className="pill gap-1" data-testid="stack-picker">
            <span className={targetFramework ? 'text-good' : 'text-warn'}>●</span>
            <span className="text-neutral-400">stack:</span>
            <select
              className="bg-transparent text-xs text-neutral-200 outline-none cursor-pointer"
              value={targetFramework ?? ''}
              onChange={(e) => void pickStack(e.target.value)}
              aria-label="Project stack (selects the CLAUDE.md template)"
              data-testid="stack-picker-select"
            >
              <option value="">unknown (pick one)</option>
              {STACK_PRESETS.map((p) => (
                <option key={p.id} value={p.id} data-testid={`stack-option-${p.id}`}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {frameworkSignals.length > 0 && (
            <span className="text-[10px] text-neutral-500 truncate max-w-full">
              signals: {frameworkSignals.join(', ')}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function ValidationRow({
  label,
  ok,
  soft,
}: {
  label: string;
  ok: boolean;
  soft?: boolean;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className={`inline-block h-2 w-2 rounded-full ${
          ok ? 'bg-good' : soft ? 'bg-warn' : 'bg-bad'
        }`}
      />
      <span className={ok ? 'text-neutral-200' : 'text-neutral-400'}>{label}</span>
    </div>
  );
}
