import type { OrchestratorApi } from '@shared/ipc';

export function api(): OrchestratorApi {
  if (typeof window === 'undefined' || !window.orchestrator) {
    throw new Error('window.orchestrator not present — preload script did not run.');
  }
  return window.orchestrator;
}
