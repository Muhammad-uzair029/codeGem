import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { api } from '@renderer/lib/api';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { ProjectSelector } from '@renderer/components/project-selector/ProjectSelector';
import { BriefIntake } from '@renderer/components/brief-intake/BriefIntake';
import { LaunchPanel } from '@renderer/components/launch-panel/LaunchPanel';
import { TerminalView } from '@renderer/components/terminal-view/TerminalView';
import { CodeExplorer } from '@renderer/components/code-explorer/CodeExplorer';

const DEFAULT_SIZES: [number, number, number] = [28, 44, 28];
const MIN_SIZES = { left: 200, center: 320, right: 240 };

export function AppShell(): JSX.Element {
  const hydrateFromConfig = useWorkspaceStore((s) => s.hydrateFromConfig);
  const targetPath = useWorkspaceStore((s) => s.targetPath);
  const [sizes, setSizes] = useState<[number, number, number]>(DEFAULT_SIZES);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const leftRef = useRef<ImperativePanelHandle>(null);
  const rightRef = useRef<ImperativePanelHandle>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void api()
      .state.read()
      .then((cfg) => {
        hydrateFromConfig({
          active_project_path: cfg.active_project_path,
          project_type: cfg.project_type,
          target_framework: cfg.target_framework,
        });
        if (cfg.layout?.panel_sizes) {
          setSizes(cfg.layout.panel_sizes);
        }
      })
      .catch(() => {/* start fresh */});
  }, [hydrateFromConfig]);

  const onLayout = useCallback((newSizes: number[]) => {
    const next = newSizes as [number, number, number];
    setSizes(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void api().state.setLayout(next);
    }, 400);
  }, []);

  const toggleLeft = () => {
    if (leftCollapsed) {
      leftRef.current?.expand();
      setLeftCollapsed(false);
    } else {
      leftRef.current?.collapse();
      setLeftCollapsed(true);
    }
  };

  const toggleRight = () => {
    if (rightCollapsed) {
      rightRef.current?.expand();
      setRightCollapsed(false);
    } else {
      rightRef.current?.collapse();
      setRightCollapsed(true);
    }
  };

  const version = import.meta.env.VITE_APP_VERSION as string | undefined;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0b0d10] text-neutral-100">
      <header className="flex items-center justify-between px-5 py-3 border-b border-surface-800 shrink-0">
        <div>
          <div className="text-sm font-semibold tracking-tight">Feature-Loop Manager</div>
          <div className="text-[11px] text-neutral-500">claude-code-boilerplate orchestrator</div>
        </div>
        <span className="pill">{version ? `v${version}` : 'v0.2.0'}</span>
      </header>

      <PanelGroup
        direction="horizontal"
        className="flex-1 overflow-hidden"
        onLayout={onLayout}
      >
        {/* Left column — Config rail */}
        <Panel
          ref={leftRef}
          defaultSize={sizes[0]}
          minSize={0}
          collapsible
          onCollapse={() => setLeftCollapsed(true)}
          onExpand={() => setLeftCollapsed(false)}
        >
          <div className="flex flex-col h-full overflow-hidden border-r border-surface-800">
            <ColumnHeader
              title="Config"
              collapsed={leftCollapsed}
              onToggle={toggleLeft}
              side="left"
            />
            {!leftCollapsed && (
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3" style={{ minWidth: MIN_SIZES.left }}>
                <ProjectSelector />
                <BriefIntake />
                <LaunchPanel />
              </div>
            )}
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-surface-800 hover:bg-violet-600 transition-colors cursor-col-resize" />

        {/* Center column — Terminal */}
        <Panel defaultSize={sizes[1]} minSize={0}>
          <div className="flex flex-col h-full overflow-hidden">
            <ColumnHeader title="Terminal" collapsed={false} onToggle={() => {}} side="center" />
            <div className="flex-1 overflow-hidden" style={{ minWidth: MIN_SIZES.center }}>
              {targetPath ? (
                <TerminalView />
              ) : (
                <EmptyCenter />
              )}
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-surface-800 hover:bg-violet-600 transition-colors cursor-col-resize" />

        {/* Right column — Code Explorer */}
        <Panel
          ref={rightRef}
          defaultSize={sizes[2]}
          minSize={0}
          collapsible
          onCollapse={() => setRightCollapsed(true)}
          onExpand={() => setRightCollapsed(false)}
        >
          <div className="flex flex-col h-full overflow-hidden border-l border-surface-800">
            <ColumnHeader
              title="Explorer"
              collapsed={rightCollapsed}
              onToggle={toggleRight}
              side="right"
            />
            {!rightCollapsed && (
              <div className="flex-1 overflow-hidden" style={{ minWidth: MIN_SIZES.right }}>
                <CodeExplorer />
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}

function ColumnHeader({
  title,
  collapsed,
  onToggle,
  side,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  side: 'left' | 'center' | 'right';
}): JSX.Element {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-surface-800 shrink-0">
      {collapsed ? (
        <button
          onClick={onToggle}
          title={`Expand ${title}`}
          className="text-neutral-400 hover:text-neutral-100 transition-colors w-full text-center text-xs"
        >
          {side === 'left' ? '›' : '‹'}
        </button>
      ) : (
        <>
          <span className="text-xs font-medium text-neutral-400 uppercase tracking-widest">{title}</span>
          {side !== 'center' && (
            <button
              onClick={onToggle}
              title={`Collapse ${title}`}
              className="text-neutral-500 hover:text-neutral-100 transition-colors text-xs px-1"
            >
              {side === 'left' ? '‹' : '›'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function EmptyCenter(): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-neutral-500 select-none">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
      <p className="text-sm">Pick a project on the left to begin.</p>
    </div>
  );
}
