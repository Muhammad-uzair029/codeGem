import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  BriefIntake,
  BriefIntakeResult,
  ExistingWorkspaceValidation,
  ExplorerReadTreeResult,
  FrameworkDetection,
  LaunchRequest,
  LaunchResult,
  LoopExitEvent,
  LoopStreamChunk,
  NewWorkspaceRequest,
  NewWorkspaceResult,
  OrchestratorApi,
  PersistentConfig,
  ProjectType,
  SkillInjectionRequest,
  SkillInjectionResult,
  TargetFramework,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalOpenRequest,
  TerminalOpenResult,
  TerminalResizeRequest,
  TerminalWriteRequest,
} from '@shared/ipc';

const api: OrchestratorApi = {
  workspace: {
    pickExistingDir: () => ipcRenderer.invoke('workspace:pickExistingDir') as Promise<string | null>,
    validateExisting: (path: string) =>
      ipcRenderer.invoke('workspace:validateExisting', path) as Promise<ExistingWorkspaceValidation>,
    pickParentDir: () => ipcRenderer.invoke('workspace:pickParentDir') as Promise<string | null>,
    defaultParentDir: () => ipcRenderer.invoke('workspace:defaultParentDir') as Promise<string>,
    scaffoldNew: (req: NewWorkspaceRequest) =>
      ipcRenderer.invoke('workspace:scaffoldNew', req) as Promise<NewWorkspaceResult>,
    detectFramework: (path: string) =>
      ipcRenderer.invoke('workspace:detectFramework', path) as Promise<FrameworkDetection>,
  },
  inbox: {
    writeBrief: (req: BriefIntake) =>
      ipcRenderer.invoke('inbox:writeBrief', req) as Promise<BriefIntakeResult>,
    briefExists: (targetPath: string) =>
      ipcRenderer.invoke('inbox:briefExists', targetPath) as Promise<boolean>,
    readDroppedFile: (path: string) =>
      ipcRenderer.invoke('inbox:readDroppedFile', path) as Promise<string>,
  },
  skills: {
    inject: (req: SkillInjectionRequest) =>
      ipcRenderer.invoke('skills:inject', req) as Promise<SkillInjectionResult>,
  },
  loop: {
    launch: (req: LaunchRequest) =>
      ipcRenderer.invoke('loop:launch', req) as Promise<LaunchResult>,
    stop: (sessionId: string) =>
      ipcRenderer.invoke('loop:stop', sessionId) as Promise<{ ok: boolean }>,
    onChunk: (cb: (chunk: LoopStreamChunk) => void) => {
      const listener = (_e: unknown, payload: LoopStreamChunk) => cb(payload);
      ipcRenderer.on('loop:chunk', listener);
      return () => ipcRenderer.removeListener('loop:chunk', listener);
    },
    onExit: (cb: (evt: LoopExitEvent) => void) => {
      const listener = (_e: unknown, payload: LoopExitEvent) => cb(payload);
      ipcRenderer.on('loop:exit', listener);
      return () => ipcRenderer.removeListener('loop:exit', listener);
    },
  },
  state: {
    read: () => ipcRenderer.invoke('state:read') as Promise<PersistentConfig>,
    setActive: (patch: {
      active_project_path: string;
      project_type: ProjectType;
      target_framework: TargetFramework | null;
    }) => ipcRenderer.invoke('state:setActive', patch) as Promise<PersistentConfig>,
    clearActive: () => ipcRenderer.invoke('state:clearActive') as Promise<PersistentConfig>,
    setLayout: (sizes: [number, number, number]) =>
      ipcRenderer.invoke('state:setLayout', sizes) as Promise<PersistentConfig>,
  },
  shortcuts: {
    onBrowseExisting: (cb: () => void) => {
      const listener = () => cb();
      ipcRenderer.on('shortcut:browseExisting', listener);
      return () => ipcRenderer.removeListener('shortcut:browseExisting', listener);
    },
    onToggleLeft: (cb: () => void) => {
      const listener = () => cb();
      ipcRenderer.on('shortcut:toggleLeft', listener);
      return () => ipcRenderer.removeListener('shortcut:toggleLeft', listener);
    },
    onQuickSwitch: (cb: () => void) => {
      const listener = () => cb();
      ipcRenderer.on('shortcut:quickSwitch', listener);
      return () => ipcRenderer.removeListener('shortcut:quickSwitch', listener);
    },
    onLaunch: (cb: () => void) => {
      const listener = () => cb();
      ipcRenderer.on('shortcut:launch', listener);
      return () => ipcRenderer.removeListener('shortcut:launch', listener);
    },
  },
  terminal: {
    open: (req: TerminalOpenRequest) =>
      ipcRenderer.invoke('terminal:open', req) as Promise<TerminalOpenResult>,
    write: (req: TerminalWriteRequest) =>
      ipcRenderer.invoke('terminal:write', req) as Promise<void>,
    resize: (req: TerminalResizeRequest) =>
      ipcRenderer.invoke('terminal:resize', req) as Promise<void>,
    close: (sessionId: string) =>
      ipcRenderer.invoke('terminal:close', sessionId) as Promise<{ ok: boolean }>,
    onData: (cb: (evt: TerminalDataEvent) => void) => {
      const listener = (_e: unknown, payload: TerminalDataEvent) => cb(payload);
      ipcRenderer.on('terminal:data', listener);
      return () => ipcRenderer.removeListener('terminal:data', listener);
    },
    onExit: (cb: (evt: TerminalExitEvent) => void) => {
      const listener = (_e: unknown, payload: TerminalExitEvent) => cb(payload);
      ipcRenderer.on('terminal:exit', listener);
      return () => ipcRenderer.removeListener('terminal:exit', listener);
    },
  },
  explorer: {
    readTree: (projectPath: string) =>
      ipcRenderer.invoke('explorer:readTree', projectPath) as Promise<ExplorerReadTreeResult>,
    openInVSCode: (projectPath: string) =>
      ipcRenderer.invoke('explorer:openInVSCode', projectPath) as Promise<{ ok: boolean; reason?: string }>,
    openInFinder: (projectPath: string) =>
      ipcRenderer.invoke('explorer:openInFinder', projectPath) as Promise<{ ok: boolean }>,
    hasVSCodeCli: () =>
      ipcRenderer.invoke('explorer:hasVSCodeCli') as Promise<boolean>,
  },
  util: {
    // Electron 32 removed the non-standard File.path property. Renderer
    // code must resolve dropped-file paths via webUtils.getPathForFile()
    // instead. Exposing it here so the renderer can drop-in-replace the
    // old `(file as any).path` reads.
    getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  },
};

contextBridge.exposeInMainWorld('orchestrator', api);
