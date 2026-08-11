import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { api } from '@renderer/lib/api';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { ProjectSelector } from '@renderer/components/project-selector/ProjectSelector';
import { BriefIntake } from '@renderer/components/brief-intake/BriefIntake';
import { LaunchPanel } from '@renderer/components/launch-panel/LaunchPanel';
import { TerminalView } from '@renderer/components/terminal-view/TerminalView';
import { CodeExplorer } from '@renderer/components/code-explorer/CodeExplorer';
import { RecentProjects } from '@renderer/components/config-rail/RecentProjects';
import { CollapsibleSection } from '@renderer/components/config-rail/CollapsibleSection';
import { StickyLaunchBar } from '@renderer/components/config-rail/StickyLaunchBar';
import { Onboarding } from '@renderer/components/onboarding/Onboarding';
import { SkillsUpdater } from '@renderer/components/config-rail/SkillsUpdater';
import { useThemeStore, type Theme } from '@renderer/state/themeStore';

const DEFAULT_SIZES: [number, number, number] = [28, 44, 28];
const MIN_SIZES = { left: 200, center: 320, right: 240 };

export function AppShell(): JSX.Element {
  const hydrateFromConfig = useWorkspaceStore((s) => s.hydrateFromConfig);
  const targetPath = useWorkspaceStore((s) => s.targetPath);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { theme, setTheme } = useThemeStore();
  const [sizes, setSizes] = useState<[number, number, number]>(DEFAULT_SIZES);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const leftRef = useRef<ImperativePanelHandle>(null);
  const rightRef = useRef<ImperativePanelHandle>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleLeftRef = useRef<() => void>(() => {});

  // Check onboarding status
  useEffect(() => {
    void api()
      .skillsRemote.status()
      .then((s) => { setOnboardingDone(s.installed || s.skipped); })
      .catch(() => { setOnboardingDone(true); });
  }, []);

  // Restore persisted config
  useEffect(() => {
    void api()
      .state.read()
      .then((cfg) => {
        hydrateFromConfig({
          active_project_path: cfg.active_project_path,
          project_type: cfg.project_type,
          target_framework: cfg.target_framework,
        });
        if (cfg.layout?.panel_sizes) setSizes(cfg.layout.panel_sizes);
      })
      .catch(() => {/* start fresh */});
  }, [hydrateFromConfig]);

  useEffect(() => { toggleLeftRef.current = toggleLeft; });

  // Global keyboard shortcuts
  useEffect(() => {
    const offToggleLeft = api().shortcuts.onToggleLeft(() => toggleLeftRef.current());
    const offLaunch = api().shortcuts.onLaunch(() => {
      window.dispatchEvent(new CustomEvent('flm:launch'));
    });
    const offBrowse = api().shortcuts.onBrowseExisting(() => {
      window.dispatchEvent(new CustomEvent('flm:browseExisting'));
    });
    const offQuickSwitch = api().shortcuts.onQuickSwitch(() => {
      window.dispatchEvent(new CustomEvent('flm:quickSwitch'));
    });
    return () => { offToggleLeft(); offLaunch(); offBrowse(); offQuickSwitch(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLayout = useCallback((newSizes: number[]) => {
    const next = newSizes as [number, number, number];
    setSizes(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void api().state.setLayout(next); }, 400);
  }, []);

  const toggleLeft = () => {
    if (leftCollapsed) { leftRef.current?.expand(); setLeftCollapsed(false); }
    else { leftRef.current?.collapse(); setLeftCollapsed(true); }
  };

  const toggleRight = () => {
    if (rightCollapsed) { rightRef.current?.expand(); setRightCollapsed(false); }
    else { rightRef.current?.collapse(); setRightCollapsed(true); }
  };

  const version = import.meta.env.VITE_APP_VERSION as string | undefined;

  if (onboardingDone === null) {
    return (
      <div className="flex h-screen bg-surface-950 items-center justify-center">
        <svg className="w-5 h-5 animate-spin text-accent-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!onboardingDone) {
    return <Onboarding onDone={() => setOnboardingDone(true)} />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-surface-950 text-neutral-100">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-surface-800 shrink-0 gap-4">
        {/* Left: Config toggle + app name */}
        <div className="flex items-center gap-3 min-w-0">
          <PanelToggleBtn
            label="Config"
            collapsed={leftCollapsed}
            side="left"
            onClick={toggleLeft}
          />
          <div className="min-w-0 hidden sm:block">
            <div className="text-sm font-semibold tracking-tight truncate">Feature-Loop Manager</div>
            <div className="text-[10px] text-neutral-500 truncate">claude-code-boilerplate orchestrator</div>
          </div>
        </div>

        {/* Right: Explorer toggle + theme + settings + version */}
        <div className="flex items-center gap-2 shrink-0">
          <PanelToggleBtn
            label="Explorer"
            collapsed={rightCollapsed}
            side="right"
            onClick={toggleRight}
          />
          <div className="w-px h-4 bg-surface-700 mx-1" />
          <ThemeToggle theme={theme} setTheme={setTheme} />
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-surface-800 transition-colors"
          >
            <GearIcon />
          </button>
          <span className="pill">{version ? `v${version}` : 'v0.2.0'}</span>
        </div>
      </header>

      {/* ── Settings modal ── */}
      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}

      {/* ── Panels ── */}
      <PanelGroup
        direction="horizontal"
        className="flex-1 overflow-hidden"
        onLayout={onLayout}
      >
        {/* Left — Config rail */}
        <Panel
          ref={leftRef}
          defaultSize={sizes[0]}
          minSize={0}
          collapsible
          onCollapse={() => setLeftCollapsed(true)}
          onExpand={() => setLeftCollapsed(false)}
        >
          <div className="flex flex-col h-full overflow-hidden border-r border-surface-800">
            <SectionLabel title="Config" />
            {!leftCollapsed && (
              <div className="flex-1 flex flex-col overflow-hidden" style={{ minWidth: MIN_SIZES.left }}>
                <RecentProjects />
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                  <CollapsibleSection title="Project" storageKey="project">
                    <ProjectSelector />
                  </CollapsibleSection>
                  <CollapsibleSection title="Brief" storageKey="brief">
                    <BriefIntake />
                  </CollapsibleSection>
                  <CollapsibleSection title="Advanced" storageKey="advanced">
                    <LaunchPanel />
                  </CollapsibleSection>
                </div>
                <StickyLaunchBar />
              </div>
            )}
          </div>
        </Panel>

        <PanelResizeHandle className="w-px bg-surface-800 hover:bg-accent-600 transition-colors cursor-col-resize" />

        {/* Center — Terminal */}
        <Panel defaultSize={sizes[1]} minSize={0}>
          <div className="flex flex-col h-full overflow-hidden">
            <SectionLabel title="Terminal" />
            <div className="flex-1 overflow-hidden" style={{ minWidth: MIN_SIZES.center }}>
              {targetPath ? <TerminalView /> : <EmptyCenter />}
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-px bg-surface-800 hover:bg-accent-600 transition-colors cursor-col-resize" />

        {/* Right — Explorer */}
        <Panel
          ref={rightRef}
          defaultSize={sizes[2]}
          minSize={0}
          collapsible
          onCollapse={() => setRightCollapsed(true)}
          onExpand={() => setRightCollapsed(false)}
        >
          <div className="flex flex-col h-full overflow-hidden border-l border-surface-800">
            <SectionLabel title="Explorer" />
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

// ── Sub-components ──────────────────────────────────────────────────────────

function PanelToggleBtn({
  label,
  collapsed,
  side,
  onClick,
}: {
  label: string;
  collapsed: boolean;
  side: 'left' | 'right';
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={collapsed ? `Show ${label}` : `Hide ${label}`}
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
        collapsed
          ? 'text-neutral-500 hover:text-neutral-200 hover:bg-surface-800'
          : 'text-neutral-300 bg-surface-800 hover:bg-surface-700'
      }`}
    >
      {side === 'left' && <ChevronIcon dir={collapsed ? 'right' : 'left'} />}
      <span>{label}</span>
      {side === 'right' && <ChevronIcon dir={collapsed ? 'left' : 'right'} />}
    </button>
  );
}

function SectionLabel({ title }: { title: string }): JSX.Element {
  return (
    <div className="px-3 py-2 border-b border-surface-800 shrink-0">
      <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">{title}</span>
    </div>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Panel */}
      <div
        className="relative z-10 w-80 h-full bg-surface-900 border-l border-surface-700 shadow-2xl flex flex-col overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700 shrink-0">
          <span className="text-sm font-semibold">Settings</span>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-100 hover:bg-surface-800 transition-colors"
          >
            <XIcon />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-6">
          {/* Skills section */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Skills</h3>
            <SkillsUpdater />
          </section>
        </div>
      </div>
    </div>
  );
}

const THEMES: { value: Theme; label: string; icon: string }[] = [
  { value: 'dark',  label: 'Dark',  icon: '🌙' },
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'mix',   label: 'Mix',   icon: '✦'  },
];

function ThemeToggle({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }): JSX.Element {
  return (
    <div className="flex items-center gap-0.5 bg-surface-800 border border-surface-700 rounded-lg p-0.5">
      {THEMES.map((t) => (
        <button
          key={t.value}
          onClick={() => setTheme(t.value)}
          title={t.label}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
            theme === t.value
              ? 'bg-accent-600 text-white'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-surface-700'
          }`}
        >
          <span>{t.icon}</span>
          <span className="hidden sm:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

function ChevronIcon({ dir }: { dir: 'left' | 'right' }): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: dir === 'left' ? 'none' : 'scaleX(-1)' }}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function GearIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function XIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
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
