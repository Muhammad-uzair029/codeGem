// @ts-check
import { defineConfig } from 'astro/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getManifest, resolveSiteUrl, buildManifest, publicManifest, installIndex, SKILLS_DIR, PLACEHOLDER_URL } from './lib/skills.mjs';
import { emit, renderInstaller } from './lib/emit.mjs';

const site = resolveSiteUrl();

/** Copies skills + manifest + installers into dist, and serves them in `astro dev`. */
function skillsPayload() {
  return {
    name: 'codegem-skills-payload',
    hooks: {
      'astro:config:setup': ({ logger }) => {
        // Validate early so a bad skills-meta.json fails before pages render.
        const m = getManifest();
        for (const w of m.warnings) logger.warn(w);
        if (site.source === 'placeholder') {
          logger.warn(`No SITE_URL / VERCEL_PROJECT_PRODUCTION_URL / URL set. Installers will contain the placeholder ${PLACEHOLDER_URL}.`);
        } else {
          logger.info(`Installers will download from ${site.url} (from ${site.source}).`);
        }
      },
      'astro:build:done': ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        const m = getManifest();
        emit(out, m);
        logger.info(`Wrote ${m.skillCount} skills (${m.fileCount} files), manifest.json, install.sh, install.ps1.`);
      },
      'astro:server:setup': ({ server }) => {
        server.middlewares.use((req, res, next) => {
          const url = new URL(req.url || '/', 'http://localhost');
          const origin = `http://${req.headers.host}`;
          const send = (body, type) => {
            res.setHeader('Content-Type', type);
            res.end(body);
          };
          if (url.pathname === '/install.sh') return send(renderInstaller('install.sh', origin), 'text/plain; charset=utf-8');
          if (url.pathname === '/install.ps1') return send(renderInstaller('install.ps1', origin), 'text/plain; charset=utf-8');
          if (url.pathname === '/manifest.json') return send(JSON.stringify(publicManifest(buildManifest({ siteUrl: origin })), null, 2), 'application/json');
          if (url.pathname === '/install-index.tsv') return send(installIndex(buildManifest({ siteUrl: origin })), 'text/plain; charset=utf-8');
          const m = url.pathname.match(/^\/skills\/([a-z0-9._-]+)\/(.+)$/);
          if (m && !m[2].split('/').includes('..')) {
            const file = path.join(SKILLS_DIR, m[1], decodeURIComponent(m[2]));
            if (file.startsWith(SKILLS_DIR + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
              return send(fs.readFileSync(file), 'text/plain; charset=utf-8');
            }
          }
          next();
        });
      },
    },
  };
}

export default defineConfig({
  output: 'static',
  site: site.source === 'placeholder' ? undefined : site.url,
  trailingSlash: 'ignore',
  integrations: [skillsPayload()],
  vite: {
    server: {
      fs: { allow: ['..'] },
    },
  },
});
