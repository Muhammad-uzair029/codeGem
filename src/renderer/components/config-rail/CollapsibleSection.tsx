import { useEffect, useState, type ReactNode } from 'react';

interface Props {
  title: string;
  storageKey: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({ title, storageKey, children, defaultOpen = true }: Props): JSX.Element {
  const [open, setOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(`flm:collapse:${storageKey}`);
      return stored === null ? defaultOpen : stored !== 'false';
    } catch {
      return defaultOpen;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(`flm:collapse:${storageKey}`, String(open));
    } catch {/* noop */}
  }, [open, storageKey]);

  return (
    <div>
      <button
        className="w-full flex items-center justify-between text-[11px] font-medium uppercase tracking-widest text-neutral-500 hover:text-neutral-300 transition-colors px-1 py-1 mb-1"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && children}
    </div>
  );
}
