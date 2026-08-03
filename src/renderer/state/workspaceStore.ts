import { create } from 'zustand';
import type { LoopStage, ProjectType, TargetFramework } from '@shared/ipc';

export type WorkspaceMode = 'existing' | 'new';

export interface WorkspaceState {
  mode: WorkspaceMode;
  targetPath: string;
  projectType: ProjectType | null;
  targetFramework: TargetFramework | null;
  frameworkSignals: string[];

  validation: {
    hasGit: boolean;
    hasPackageJson: boolean;
    hasClaudeDir: boolean;
    ok: boolean;
    reason?: string;
  } | null;

  parentDir: string;
  projectName: string;

  brief: {
    markdown: string;
    figmaUrl: string;
    figmaMcpUrl: string;
  };
  briefWritten: boolean;

  skillsInjected: boolean;
  skillsCopiedCount: number;
  canonicalDirsEnsured: string[];

  sessionId: string | null;
  stage: LoopStage;
  running: boolean;

  setMode: (m: WorkspaceMode) => void;
  setTargetPath: (p: string, projectType: ProjectType | null) => void;
  setValidation: (v: WorkspaceState['validation']) => void;
  setFramework: (f: TargetFramework | null, signals: string[]) => void;
  setParentDir: (p: string) => void;
  setProjectName: (n: string) => void;
  setBrief: (patch: Partial<WorkspaceState['brief']>) => void;
  setBriefWritten: (b: boolean) => void;
  setSkills: (b: boolean, count: number, canonicalDirsEnsured: string[]) => void;
  setSession: (id: string | null, running: boolean) => void;
  setStage: (s: LoopStage) => void;
  hydrateFromConfig: (patch: {
    active_project_path: string | null;
    project_type: ProjectType | null;
    target_framework: TargetFramework | null;
  }) => void;
  reset: () => void;
}

const initial = {
  mode: 'existing' as WorkspaceMode,
  targetPath: '',
  projectType: null as ProjectType | null,
  targetFramework: null as TargetFramework | null,
  frameworkSignals: [] as string[],
  validation: null,
  parentDir: '',
  projectName: '',
  brief: { markdown: '', figmaUrl: '', figmaMcpUrl: '' },
  briefWritten: false,
  skillsInjected: false,
  skillsCopiedCount: 0,
  canonicalDirsEnsured: [] as string[],
  sessionId: null,
  stage: 'unknown' as LoopStage,
  running: false,
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  ...initial,
  setMode: (mode) => set({ mode }),
  setTargetPath: (targetPath, projectType) =>
    set({
      targetPath,
      projectType,
      validation: null,
      briefWritten: false,
      skillsInjected: false,
      targetFramework: null,
      frameworkSignals: [],
    }),
  setValidation: (validation) => set({ validation }),
  setFramework: (targetFramework, frameworkSignals) => set({ targetFramework, frameworkSignals }),
  setParentDir: (parentDir) => set({ parentDir }),
  setProjectName: (projectName) => set({ projectName }),
  setBrief: (patch) => set((s) => ({ brief: { ...s.brief, ...patch } })),
  setBriefWritten: (briefWritten) => set({ briefWritten }),
  setSkills: (skillsInjected, skillsCopiedCount, canonicalDirsEnsured) =>
    set({ skillsInjected, skillsCopiedCount, canonicalDirsEnsured }),
  setSession: (sessionId, running) => set({ sessionId, running }),
  setStage: (stage) => set({ stage }),
  hydrateFromConfig: ({ active_project_path, project_type, target_framework }) => {
    if (!active_project_path) return;
    set({
      targetPath: active_project_path,
      projectType: project_type,
      targetFramework: target_framework,
      mode: project_type === 'NEW_SCAFFOLD' ? 'new' : 'existing',
    });
  },
  reset: () => set(initial),
}));
