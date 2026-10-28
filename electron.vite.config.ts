import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { defineConfig, externalizeDepsPlugin, bytecodePlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import obfuscator from 'rollup-plugin-obfuscator';

const require = createRequire(import.meta.url);
const pkg = require('./package.json') as { version: string };

// Installers are public (codeGem-releases) while the source is private.
// Main + preload ship as V8 bytecode (no readable JS); our own renderer
// code is obfuscated. Bytecode is tied to the CPU architecture, so each
// target must be built on (or with an Electron binary for) that arch —
// see the per-arch macOS jobs in .github/workflows/release.yml.
//
// bytecodePlugin needs CommonJS output, hence the .cjs entry files
// (package.json is "type": "module").

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), bytecodePlugin()],
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
    plugins: [externalizeDepsPlugin(), bytecodePlugin()],
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
      {
        // Obfuscate only our own modules (not React/xterm etc.): keeps the
        // bundle fast while making the app's logic unreadable. Options are
        // the ones that don't change runtime behaviour.
        ...obfuscator({
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
        enforce: 'post',
        apply: 'build',
      },
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
