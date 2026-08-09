import { useWorkspaceStore } from '@renderer/state/workspaceStore';

export function CodeExplorer(): JSX.Element {
  const targetPath = useWorkspaceStore((s) => s.targetPath);

  if (!targetPath) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm select-none px-4 text-center">
        No project selected.
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full text-neutral-500 text-sm select-none px-4 text-center">
      Explorer loading…
    </div>
  );
}
