// Shared IPC contract between the Electron main process and the React
// renderer. The preload script exposes these through window.orchestrator
// via contextBridge.

export type ProjectType = 'NEW_SCAFFOLD' | 'EXISTING_LEGACY';
export type TargetFramework = 'REACT_NATIVE_EXPO' | 'NEST_JS';

// Layout panel sizes persisted in config.json.
export interface LayoutConfig {
  panel_sizes: [number, number, number];
}

// Persistent config.json shape (Electron userData/config.json).
export interface PersistentConfig {
  active_project_path: string | null;
  project_type: ProjectType | null;
  target_framework: TargetFramework | null;
  history: Array<{
    active_project_path: string;
    project_type: ProjectType;
    target_framework: TargetFramework | null;
    last_used_at: string;
  }>;
  layout?: LayoutConfig;
}

export interface ExistingWorkspaceValidation {
  ok: boolean;
  path: string;
  hasGit: boolean;
  hasPackageJson: boolean;
  hasClaudeDir: boolean;
  reason?: string;
}

export interface NewWorkspaceRequest {
  parentDir: string;
  projectName: string;
}

export interface NewWorkspaceResult {
  ok: boolean;
  path: string;
  reason?: string;
}

export interface FrameworkDetection {
  framework: TargetFramework | null;
  signals: string[];
}

export interface BriefIntake {
  targetPath: string;
  briefMarkdown: string;
  figmaUrl?: string;
  figmaNodeId?: string;
  figmaFileKey?: string;
  figmaMcpUrl?: string;
}

export interface BriefIntakeResult {
  ok: boolean;
  briefPath: string;
  mcpJsonWritten: boolean;
  reason?: string;
}

export interface SkillInfo {
  name: string;
  description: string;
}

export interface SkillsRemoteListResult {
  ok: boolean;
  skills: SkillInfo[];
  reason?: string;
}

export interface SkillsInstallResult {
  ok: boolean;
  count: number;
  reason?: string;
}

export interface SkillsCacheStatus {
  installed: boolean;
  downloadedAt: string | null;
  count: number;
  skills: string[];
  skipped: boolean;
}

export interface SkillInjectionRequest {
  targetPath: string;
  overwrite?: boolean;
}

export interface SkillInjectionResult {
  ok: boolean;
  skillsCopied: number;
  claudeMdWritten: boolean;
  canonicalDirsEnsured: string[];
  reason?: string;
}

export interface LaunchRequest {
  targetPath: string;
  forceAutonomous?: boolean;
  extraArgs?: string[];
}

export interface LaunchResult {
  ok: boolean;
  sessionId?: string;
  pid?: number;
  reason?: string;
}

export type LoopStage =
  | 'unknown'
  | 'intake'
  | 'brainstorm'
  | 'spec'
  | 'implement'
  | 'verify'
  | 'learn';

export interface LoopStreamChunk {
  sessionId: string;
  channel: 'stdout' | 'stderr' | 'system';
  data: string;
  stage: LoopStage;
  ts: number;
}

export interface LoopExitEvent {
  sessionId: string;
  code: number | null;
  signal: string | null;
  ts: number;
}

// Terminal IPC types.
export interface TerminalOpenRequest {
  projectPath: string;
}

export interface TerminalOpenResult {
  ok: boolean;
  sessionId: string;
  reason?: string;
}

export interface TerminalWriteRequest {
  sessionId: string;
  data: string;
}

export interface TerminalResizeRequest {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface TerminalDataEvent {
  sessionId: string;
  data: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  code: number | null;
}

// Explorer IPC types.
export interface FileNode {
  id: string;
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

export interface ExplorerReadTreeResult {
  ok: boolean;
  tree: FileNode[];
  reason?: string;
}

// window.orchestrator surface.
export interface OrchestratorApi {
  workspace: {
    pickExistingDir: () => Promise<string | null>;
    validateExisting: (path: string) => Promise<ExistingWorkspaceValidation>;
    pickParentDir: () => Promise<string | null>;
    defaultParentDir: () => Promise<string>;
    scaffoldNew: (req: NewWorkspaceRequest) => Promise<NewWorkspaceResult>;
    detectFramework: (path: string) => Promise<FrameworkDetection>;
  };
  inbox: {
    writeBrief: (req: BriefIntake) => Promise<BriefIntakeResult>;
    briefExists: (targetPath: string) => Promise<boolean>;
    readDroppedFile: (path: string) => Promise<string>;
  };
  skills: {
    inject: (req: SkillInjectionRequest) => Promise<SkillInjectionResult>;
  };
  skillsRemote: {
    fetchList: () => Promise<SkillsRemoteListResult>;
    install: (names: string[]) => Promise<SkillsInstallResult>;
    installAll: () => Promise<SkillsInstallResult>;
    status: () => Promise<SkillsCacheStatus>;
    skip: () => Promise<void>;
  };
  loop: {
    launch: (req: LaunchRequest) => Promise<LaunchResult>;
    stop: (sessionId: string) => Promise<{ ok: boolean }>;
    onChunk: (cb: (chunk: LoopStreamChunk) => void) => () => void;
    onExit: (cb: (evt: LoopExitEvent) => void) => () => void;
  };
  state: {
    read: () => Promise<PersistentConfig>;
    setActive: (patch: {
      active_project_path: string;
      project_type: ProjectType;
      target_framework: TargetFramework | null;
    }) => Promise<PersistentConfig>;
    clearActive: () => Promise<PersistentConfig>;
    setLayout: (sizes: [number, number, number]) => Promise<PersistentConfig>;
  };
  shortcuts: {
    onBrowseExisting: (cb: () => void) => () => void;
    onToggleLeft: (cb: () => void) => () => void;
    onQuickSwitch: (cb: () => void) => () => void;
    onLaunch: (cb: () => void) => () => void;
  };
  terminal: {
    open: (req: TerminalOpenRequest) => Promise<TerminalOpenResult>;
    write: (req: TerminalWriteRequest) => Promise<void>;
    resize: (req: TerminalResizeRequest) => Promise<void>;
    close: (sessionId: string) => Promise<{ ok: boolean }>;
    onData: (cb: (evt: TerminalDataEvent) => void) => () => void;
    onExit: (cb: (evt: TerminalExitEvent) => void) => () => void;
  };
  explorer: {
    readTree: (projectPath: string) => Promise<ExplorerReadTreeResult>;
    openInVSCode: (projectPath: string) => Promise<{ ok: boolean; reason?: string }>;
    openInFinder: (projectPath: string) => Promise<{ ok: boolean }>;
    hasVSCodeCli: () => Promise<boolean>;
  };
  util: {
    getPathForFile: (file: File) => string;
  };
}

declare global {
  interface Window {
    orchestrator: OrchestratorApi;
  }
}
