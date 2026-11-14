import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { defineConfig } from 'vite';

// data/ stays at the repository root. The page fetches it by string paths (js/data.js, js/loading.js), so
// Vite neither bundles nor copies it: the dev server serves it from the root as is, and this copies it to dist/data/.
const copyData = () => {
  let outDir;
  return {
    name: 'copy-data',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    writeBundle() { cpSync(resolve(import.meta.dirname, 'data'), resolve(outDir, 'data'), { recursive: true }); },
  };
};

// The dev and preview servers would send data/*.gz with Content-Encoding: gzip, and the browser would unzip them on
// the way in. Send them as stored bytes (application/gzip), as tools/serve.py did and the perf harness does: the page unzips them.
const rawGz = () => {
  const serve = dir => (req, res, next) => {
    const file = join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.endsWith('.gz') || !file.startsWith(join(dir, 'data') + sep) || !existsSync(file)) return next();
    res.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Length': statSync(file).size, 'Cache-Control': 'no-cache' });
    createReadStream(file).pipe(res);
  };
  return {
    name: 'raw-gz',
    configureServer(s) { s.middlewares.use(serve(s.config.root)); },
    configurePreviewServer(s) { s.middlewares.use(serve(resolve(s.config.root, s.config.build.outDir))); },
  };
};

export default defineConfig({
  plugins: [copyData(), rawGz()],
  appType: 'mpa',   // a missing file is a 404, as in production, not index.html
  build: {
    outDir: 'dist',
    sourcemap: true,
    // no syntax lowering: js/main.js awaits at module top level, and the page runs today's syntax as is
    target: 'esnext',
  },
});
