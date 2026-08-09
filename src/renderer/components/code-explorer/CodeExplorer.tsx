import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Tree, type NodeApi, type NodeRendererProps } from 'react-arborist';
import { api } from '@renderer/lib/api';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import type { FileNode } from '@shared/ipc';

type TreeNode = FileNode & { children?: TreeNode[] };

export function CodeExplorer(): JSX.Element {
  const targetPath = useWorkspaceStore((s) => s.targetPath);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasVSCode, setHasVSCode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [treeHeight, setTreeHeight] = useState(400);

  // Detect VS Code CLI on mount.
  useEffect(() => {
    void api().explorer.hasVSCodeCli().then(setHasVSCode).catch(() => setHasVSCode(false));
  }, []);

  // Load tree whenever project changes.
  useEffect(() => {
    if (!targetPath) { setTree([]); return; }
    setLoading(true);
    setError(null);
    void api()
      .explorer.readTree(targetPath)
      .then((r) => {
        if (r.ok) setTree(r.tree as TreeNode[]);
        else setError(r.reason ?? 'Failed to read tree');
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [targetPath]);

  // Measure available height for the tree.
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        setTreeHeight(containerRef.current.clientHeight - 80);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const openVSCode = async () => {
    if (!targetPath) return;
    const r = await api().explorer.openInVSCode(targetPath);
    if (!r.ok && r.reason) {
      toast.error(r.reason, { duration: 6000 });
    }
  };

  const openFinder = async () => {
    if (!targetPath) return;
    await api().explorer.openInFinder(targetPath);
  };

  if (!targetPath) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm select-none px-4 text-center">
        No project selected.
      </div>
    );
  }

  const shortPath = targetPath.replace(/^\/Users\/[^/]+/, '~');

  return (
    <div className="flex flex-col h-full overflow-hidden" ref={containerRef}>
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b border-surface-800">
        <div className="text-[11px] text-neutral-400 font-mono truncate mb-2" title={targetPath}>
          {shortPath}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-primary text-xs px-3 py-1"
            onClick={openVSCode}
            disabled={!hasVSCode}
            title={hasVSCode ? 'Open in VS Code' : 'VS Code CLI (code) not found on PATH'}
          >
            Open in VS Code
          </button>
          <button className="btn-ghost text-xs px-3 py-1" onClick={openFinder}>
            Show in Finder
          </button>
        </div>
      </div>

      {/* Tree body */}
      <div className="flex-1 overflow-hidden px-1 pt-1">
        {loading ? (
          <div className="flex items-center justify-center h-20 text-neutral-500 text-xs">
            Loading…
          </div>
        ) : error ? (
          <div className="text-xs text-bad px-3 py-2">{error}</div>
        ) : tree.length === 0 ? (
          <div className="text-xs text-neutral-500 px-3 py-2">Empty directory.</div>
        ) : (
          <Tree<TreeNode>
            data={tree}
            idAccessor="id"
            childrenAccessor="children"
            height={treeHeight}
            indent={14}
            rowHeight={22}
            openByDefault={false}
            disableDrag
            disableDrop
            disableEdit
            onSelect={(nodes: NodeApi<TreeNode>[]) => {
              const node = nodes[0];
              if (node && !node.data.isDir) {
                const lineEst = '?? lines';
                const ext = node.data.name.split('.').pop() ?? '';
                const lang = EXT_LANG[ext] ?? (ext.toUpperCase() || 'file');
                console.info(`[explorer] selected: ${node.data.path} — ${lineEst} · ${lang}`);
              }
            }}
          >
            {NodeRow}
          </Tree>
        )}
      </div>
    </div>
  );
}

function NodeRow({ node, style, dragHandle }: NodeRendererProps<TreeNode>): JSX.Element {
  return (
    <div
      ref={dragHandle}
      style={style}
      className={`flex items-center gap-1 text-[11px] cursor-default select-none rounded px-1 transition-colors ${
        node.isSelected ? 'bg-accent-600/25 text-neutral-100' : 'text-neutral-300 hover:bg-surface-700/50'
      }`}
      onClick={() => node.isInternal && node.toggle()}
    >
      <span className="shrink-0 w-3 text-center text-neutral-500">
        {node.isInternal ? (node.isOpen ? '▾' : '▸') : ''}
      </span>
      <span className="shrink-0">
        {node.data.isDir ? (node.isOpen ? '📂' : '📁') : fileIcon(node.data.name)}
      </span>
      <span className="truncate">{node.data.name}</span>
    </div>
  );
}

const EXT_LANG: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
  py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java',
  md: 'Markdown', json: 'JSON', yaml: 'YAML', yml: 'YAML',
  css: 'CSS', scss: 'SCSS', html: 'HTML', sh: 'Shell', bash: 'Shell',
};

function fileIcon(name: string): string {
  const ext = name.split('.').pop() ?? '';
  const icons: Record<string, string> = {
    ts: '🟦', tsx: '🟦', js: '🟨', jsx: '🟨', py: '🐍', md: '📝',
    json: '📋', yaml: '📋', yml: '📋', css: '🎨', scss: '🎨',
    html: '🌐', sh: '⚙️', bash: '⚙️', rs: '🦀', go: '🐹',
  };
  return icons[ext] ?? '📄';
}
