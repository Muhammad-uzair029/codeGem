import { useEffect } from 'react';
import { api } from '@renderer/lib/api';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { ProjectSelector } from '@renderer/components/project-selector/ProjectSelector';
import { BriefIntake } from '@renderer/components/brief-intake/BriefIntake';
import { LaunchPanel } from '@renderer/components/launch-panel/LaunchPanel';
import { TerminalView } from '@renderer/components/terminal-view/TerminalView';

export function Dashboard(): JSX.Element {
  const hydrateFromConfig = useWorkspaceStore((s) => s.hydrateFromConfig);

  useEffect(() => {
    void api()
      .state.read()
      .then((cfg) => {
        hydrateFromConfig({
          active_project_path: cfg.active_project_path,
          project_type: cfg.project_type,
          target_framework: cfg.target_framework,
        });
      })
      .catch(() => {
        /* config missing/malformed — start fresh */
      });
  }, [hydrateFromConfig]);

  return (
    <div className="flex flex-col min-h-screen">
      <header className="px-6 py-4 border-b border-surface-800 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold tracking-tight">SkillFacet</div>
          <div className="text-xs text-neutral-400">
            Run the feature-loop on your projects with Claude Code.
          </div>
        </div>
        <span className="pill">v0.1.0</span>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 p-4 overflow-hidden">
        <div className="flex flex-col gap-4 overflow-y-auto pr-1">
          <ProjectSelector />
          <BriefIntake />
          <LaunchPanel />
        </div>
        <div className="flex flex-col gap-4 overflow-hidden">
          <TerminalView />
        </div>
      </main>
    </div>
  );
}
