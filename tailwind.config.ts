import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          950: '#0b0d10',
          900: '#111418',
          800: '#181c22',
          700: '#232830',
          600: '#2f3540',
        },
        accent: {
          500: '#7c5cff',
          600: '#6a48f5',
          700: '#5636e0',
        },
        good: '#4ade80',
        warn: '#facc15',
        bad: '#f87171',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'Segoe UI', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
