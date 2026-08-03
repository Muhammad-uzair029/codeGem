import { contextBridge, ipcRenderer } from 'electron';
import type {
  BriefIntake,
  BriefIntakeResult,
  ExistingWorkspaceValidation,
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
  },
};

contextBridge.exposeInMainWorld('orchestrator', api);
