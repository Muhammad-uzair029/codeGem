import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import obfuscator from 'rollup-plugin-obfuscator';

const require = createRequire(import.meta.url);
const pkg = require('./package.json') as { version: string };

// Installers are public (codeGem-releases) while the source is private, so
// our own code in main, preload and renderer is obfuscated and minified.
//
// No V8 bytecode: its cache embeds a read-only-snapshot checksum that
// differs between machines, so bytecode compiled on a CI runner was
// rejected on users' machines (v0.2.21/0.2.22 failed to start).
//
// Main/preload stay CommonJS (.cjs entries; package.json is "type": "module").

// Options that don't change runtime behaviour.
//   bundle: false → per module, our src/ only (renderer: keeps React etc. as is)
//   bundle: true  → the finished chunk (main/preload: deps are external, so the
//                   chunk is our code, and import.meta.url has already been
//                   turned into CommonJS — obfuscating it per module broke it)
const ownCodeObfuscator = ({ bundle }: { bundle: boolean }) => ({
  ...obfuscator({
    global: bundle,
    include: ['src/**/*.ts', 'src/**/*.tsx'],
    exclude: ['node_modules/**'],
    options: {
      compact: true,
      identifierNamesGenerator: 'hexadecimal',
      renameGlobals: false,
      stringArray: true,
      stringArrayEncoding: ['base64'],
      stringArrayThreshold: 0.75,
      splitStrings: false,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      selfDefending: false,
      debugProtection: false,
      transformObjectKeys: false,
      unicodeEscapeSequence: false,
      sourceMap: false,
    },
  }),
  enforce: 'post' as const,
  apply: 'build' as const,
});

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), ownCodeObfuscator({ bundle: true })],
    build: {
      outDir: 'out/main',
      minify: true,
      lib: {
        entry: resolve(__dirname, 'src/main/index.ts'),
        formats: ['cjs'],
        fileName: () => 'index.cjs',
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin(), ownCodeObfuscator({ bundle: true })],
    build: {
      outDir: 'out/preload',
      minify: true,
      lib: {
        entry: resolve(__dirname, 'src/main/preload.ts'),
        formats: ['cjs'],
        fileName: () => 'preload.cjs',
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
  renderer: {
    root: '.',
    plugins: [
      react(),
      ownCodeObfuscator({ bundle: false }),
    ],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    },
    build: {
      outDir: 'out/renderer',
      // electron-vite leaves the renderer unminified by default; minify so
      // top-level names (which the obfuscator keeps) are mangled too.
      minify: true,
      sourcemap: false,
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
});
