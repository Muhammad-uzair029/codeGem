import { create } from 'zustand';

export type Theme = 'dark' | 'light' | 'mix';

const STORAGE_KEY = 'codegem-theme';

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
}

function loadTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  return stored ?? 'dark';
}

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => {
  const initial = loadTheme();
  applyTheme(initial);
  return {
    theme: initial,
    setTheme: (theme) => {
      applyTheme(theme);
      set({ theme });
    },
  };
});
