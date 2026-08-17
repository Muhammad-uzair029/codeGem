import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { api } from '@renderer/lib/api';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';

type TermMode = 'shell' | 'feature-loop';

const XTERM_THEME = {
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
};

export function TerminalView(): JSX.Element {
  const { targetPath, setStage, setSession, sessionId } = useWorkspaceStore();
  const [mode, setMode] = useState<TermMode>('shell');
  const [isListening, setIsListening] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const shellSessionRef = useRef<string | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const initTerm = useCallback((container: HTMLDivElement, interactive: boolean) => {
    const term = new Terminal({
      fontFamily: 'SF Mono, Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      convertEol: true,
      theme: XTERM_THEME,
      scrollback: 5000,
      disableStdin: !interactive,
      cursorBlink: interactive,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch {/* noop */}
    });
    ro.observe(container);
    roRef.current = ro;

    return { term, fit };
  }, []);

  const disposeTerm = useCallback(() => {
    roRef.current?.disconnect();
    roRef.current = null;
    termRef.current?.dispose();
    termRef.current = null;
    fitRef.current = null;
  }, []);

  // Shell mode effect
  useEffect(() => {
    if (mode !== 'shell' || !containerRef.current || !targetPath) return;

    const container = containerRef.current;
    const { term } = initTerm(container, true);

    let sessionId: string | null = null;

    const openShell = async () => {
      term.writeln('\x1b[38;5;244m[shell] opening PTY…\x1b[0m');
      const result = await api().terminal.open({ projectPath: targetPath });
      if (!result.ok) {
        term.writeln(`\x1b[31m[shell] failed: ${result.reason ?? 'unknown'}\x1b[0m`);
        return;
      }
      sessionId = result.sessionId;
      shellSessionRef.current = sessionId;
    };

    const offData = api().terminal.onData((evt) => {
      if (evt.sessionId === shellSessionRef.current) {
        termRef.current?.write(evt.data);
      }
    });

    const offExit = api().terminal.onExit((evt) => {
      if (evt.sessionId === shellSessionRef.current) {
        termRef.current?.writeln('\x1b[38;5;244m[shell] session ended\x1b[0m');
        shellSessionRef.current = null;
      }
    });

    const onKeyDispose = term.onData((data) => {
      if (shellSessionRef.current) {
        void api().terminal.write({ sessionId: shellSessionRef.current, data });
      }
    });

    const onResizeDispose = term.onResize(({ cols, rows }) => {
      if (shellSessionRef.current) {
        void api().terminal.resize({ sessionId: shellSessionRef.current, cols, rows });
      }
    });

    void openShell();

    return () => {
      offData();
      offExit();
      onKeyDispose.dispose();
      onResizeDispose.dispose();
      if (shellSessionRef.current) {
        void api().terminal.close(shellSessionRef.current);
        shellSessionRef.current = null;
      }
      disposeTerm();
    };
  }, [mode, targetPath, initTerm, disposeTerm]);

  // Feature Loop mode effect
  useEffect(() => {
    if (mode !== 'feature-loop' || !containerRef.current) return;

    const container = containerRef.current;
    const { term } = initTerm(container, false);

    term.writeln('\x1b[38;5;244m[feature-loop] terminal ready — launch the loop to stream.\x1b[0m');

    const offChunk = api().loop.onChunk((chunk) => {
      if (chunk.stage && chunk.stage !== 'unknown') setStage(chunk.stage);
      const prefix =
        chunk.channel === 'stderr' ? '\x1b[31m' : chunk.channel === 'system' ? '\x1b[38;5;244m' : '';
      const suffix = chunk.channel === 'stdout' ? '' : '\x1b[0m';
      term.write(prefix + chunk.data + suffix);
    });

    const offExit = api().loop.onExit((evt) => {
      term.writeln(
        `\x1b[38;5;244m[feature-loop] session ${evt.sessionId.slice(0, 8)} exited code=${evt.code ?? 'null'}\x1b[0m`,
      );
      setSession(null, false);
    });

    return () => {
      offChunk();
      offExit();
      disposeTerm();
    };
  }, [mode, initTerm, disposeTerm, setStage, setSession]);

  const clearTerm = () => termRef.current?.clear();

  const copySelection = () => {
    const sel = termRef.current?.getSelection();
    if (sel) void navigator.clipboard.writeText(sel);
  };

  const restartShell = () => {
    if (shellSessionRef.current) {
      void api().terminal.close(shellSessionRef.current);
      shellSessionRef.current = null;
    }
    // Re-trigger shell mount by briefly toggling (no-op since useEffect deps stable)
    if (targetPath) {
      const result_promise = api().terminal.open({ projectPath: targetPath });
      void result_promise.then((result) => {
        if (result.ok) {
          shellSessionRef.current = result.sessionId;
          termRef.current?.writeln('\x1b[38;5;244m[shell] restarted\x1b[0m');
        }
      });
    }
  };

  const stopShell = () => {
    if (shellSessionRef.current) {
      void api().terminal.close(shellSessionRef.current);
      shellSessionRef.current = null;
    }
  };

  const toggleVoice = () => {
    if (isListening) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      recognitionRef.current?.stop();
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const transcript = (event.results[0]?.[0]?.transcript as string) ?? '';
      if (transcript && shellSessionRef.current) {
        void api().terminal.write({ sessionId: shellSessionRef.current, data: transcript });
      }
    };
    recognition.onend = () => { setIsListening(false); recognitionRef.current = null; };
    recognition.onerror = () => { setIsListening(false); recognitionRef.current = null; };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  };

  // Stop recognition when mode changes away from shell
  useEffect(() => {
    if (mode !== 'shell' && recognitionRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      recognitionRef.current.stop();
    }
  }, [mode]);

  return (
    <section className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-surface-700/60 gap-2">
        {/* Mode toggle */}
        <div
          role="tablist"
          aria-label="Terminal mode"
          className="inline-flex rounded-lg border border-surface-700 p-0.5 bg-surface-800"
        >
          {(['shell', 'feature-loop'] as TermMode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                mode === m ? 'bg-accent-600 text-white' : 'text-neutral-400 hover:text-neutral-200'
              }`}
              onClick={() => setMode(m)}
            >
              {m === 'shell' ? 'Shell' : 'Feature Loop'}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <ToolBtn title="Clear" onClick={clearTerm}>✕</ToolBtn>
          <ToolBtn title="Copy selection" onClick={copySelection}>⎘</ToolBtn>
          {mode === 'shell' && (
            <>
              <VoiceMicBtn isListening={isListening} onClick={toggleVoice} />
              <ToolBtn title="Restart session" onClick={restartShell}>↺</ToolBtn>
              <ToolBtn title="Stop session" onClick={stopShell}>■</ToolBtn>
            </>
          )}
          {sessionId && mode === 'feature-loop' && (
            <span className="pill ml-1">
              <span className="text-good">●</span> {sessionId.slice(0, 8)}
            </span>
          )}
        </div>
      </div>

      {/* Terminal viewport */}
      <div
        ref={containerRef}
        className="flex-1 p-2 bg-surface-950 overflow-hidden"
        role="log"
        aria-label={mode === 'shell' ? 'Interactive shell terminal' : 'Feature-loop terminal stream'}
      />
    </section>
  );
}

function ToolBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded text-neutral-400 hover:text-neutral-100 hover:bg-surface-700 transition-colors text-xs"
    >
      {children}
    </button>
  );
}

function VoiceMicBtn({ isListening, onClick }: { isListening: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      title={isListening ? 'Stop recording' : 'Dictate to terminal'}
      onClick={onClick}
      className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
        isListening
          ? 'text-red-400 bg-red-500/20 hover:bg-red-500/30 animate-pulse'
          : 'text-neutral-400 hover:text-neutral-100 hover:bg-surface-700'
      }`}
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    </button>
  );
}
