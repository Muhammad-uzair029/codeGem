import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { api } from '@renderer/lib/api';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';

export function TerminalView(): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const { setStage, setSession, sessionId } = useWorkspaceStore();

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      fontFamily: 'SF Mono, Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      convertEol: true,
      theme: {
        background: '#0b0d10',
        foreground: '#e5e7eb',
        cursor: '#7c5cff',
        black: '#0b0d10',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e5e7eb',
      },
      scrollback: 5000,
      disableStdin: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* noop */
      }
    });
    ro.observe(containerRef.current);

    term.writeln('\x1b[38;5;244m[feature-loop-manager] terminal ready — launch the loop to stream.\x1b[0m');

    const offChunk = api().loop.onChunk((chunk) => {
      if (chunk.stage && chunk.stage !== 'unknown') setStage(chunk.stage);
      const prefix =
        chunk.channel === 'stderr'
          ? '\x1b[31m'
          : chunk.channel === 'system'
            ? '\x1b[38;5;244m'
            : '';
      const suffix = chunk.channel === 'stdout' ? '' : '\x1b[0m';
      term.write(prefix + chunk.data + suffix);
    });
    const offExit = api().loop.onExit((evt) => {
      term.writeln(
        `\x1b[38;5;244m[feature-loop-manager] session ${evt.sessionId.slice(0, 8)} exited code=${
          evt.code ?? 'null'
        } signal=${evt.signal ?? 'null'}\x1b[0m`,
      );
      setSession(null, false);
    });

    return () => {
      offChunk();
      offExit();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, [setStage, setSession]);

  return (
    <section className="card flex flex-col overflow-hidden" style={{ minHeight: 260 }}>
      <header className="flex items-center justify-between px-4 py-2 border-b border-surface-700/60">
        <div>
          <div className="text-sm font-semibold">Terminal stream</div>
          <div className="text-[11px] text-neutral-400">
            stdout / stderr from the detached <code>claude</code> child process.
          </div>
        </div>
        {sessionId && (
          <span className="pill">
            <span className="text-good">●</span> session {sessionId.slice(0, 8)}
          </span>
        )}
      </header>
      <div
        ref={containerRef}
        className="flex-1 p-2 bg-surface-950"
        role="log"
        aria-label="Feature-loop terminal stream"
      />
    </section>
  );
}
