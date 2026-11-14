import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { defineConfig, normalizePath } from 'vite';

// data/ stays at the repository root, where the pipeline writes it. The page asks for each file by the URL that
// js/main.ts's import.meta.glob ?url (URLS) gives it: the dev server serves data/ as it is, and a build copies
// each file into dist/assets/ under a content-hashed name. (Forward slashes, as Vite's ids have them on Windows too.)
const DATA = normalizePath(resolve(import.meta.dirname, 'data')) + '/';

// The dev and preview servers would send *.gz with Content-Encoding: gzip, and the browser would unzip them on the way
// in. Send them as stored bytes (application/gzip), as tools/serve.py did and the perf harness does: the page unzips them.
const rawGz = () => {
  const serve = (dir, sub) => (req, res, next) => {
    const u = new URL(req.url, 'http://x'), file = join(dir, decodeURIComponent(u.pathname));
    // (with a query it is not the file: ?import&url asks the dev server for the module that gives its URL, for URLS in main.js)
    if (u.search || !file.endsWith('.gz') || !file.startsWith(join(dir, sub) + sep) || !existsSync(file)) return next();
    res.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Length': statSync(file).size, 'Cache-Control': 'no-cache' });
    createReadStream(file).pipe(res);
  };
  return {
    name: 'raw-gz',
    configureServer(s) { s.middlewares.use(serve(s.config.root, 'data')); },   // data/<city>/ as it is
    configurePreviewServer(s) { s.middlewares.use(serve(resolve(s.config.root, s.config.build.outDir), s.config.build.assetsDir)); },   // the build's copies
  };
};

// Built file names say which city a file belongs to (tools/perf's smoke checks that a city loads nothing of another's): a city's
// data files and loading screens are data-<city>-<file>, its code (js/scene/<city>/<city>.js) <city>; then the content hash,
// which lets /assets/ be cached for a year (public/_headers). tools/perf/build.mjs builds the same names without the hash.
// A file that several cities have byte for byte (an empty river.json) is built once, as one file for all of them, so it is
// named for all of them: data-jsh-nola-nyc-river.json. owners: data/<city>/<file> -> those cities, for such files.
const owners = new Map(), bySize = new Map();
for (const c of existsSync(DATA) ? readdirSync(DATA) : []) for (const f of statSync(DATA + c).isDirectory() ? readdirSync(DATA + c) : []) {
  const s = statSync(join(DATA, c, f)); if (s.isFile()) bySize.set(s.size, [...(bySize.get(s.size) || []), [c, f]]);
}
for (const same of bySize.values()) for (const [c, f] of same.length > 1 ? same : []) {
  const b = readFileSync(join(DATA, c, f)), all = same.filter(([c2, f2]) => readFileSync(join(DATA, c2, f2)).equals(b)).map(([c2]) => c2);
  if (all.length > 1) owners.set(`data/${c}/${f}`, [...new Set(all)].sort());
}
const names = {
  assetFileNames: a => {
    const f = normalizePath(a.originalFileNames?.[0] || ''), city = owners.get(f) || [/^data\/([^/]+)\//.exec(f)?.[1]].filter(Boolean);
    return `assets/${city.length ? `data-${city.join('-')}-` : ''}[name]-[hash][extname]`;
  },
};

export default defineConfig({
  plugins: [rawGz()],
  appType: 'mpa',   // a missing file is a 404, as in production, not index.html
  build: {
    outDir: 'dist',
    sourcemap: true,
    // no syntax lowering: js/main.ts awaits at module top level, and the page runs today's syntax as is
    target: 'esnext',
    // Lightning CSS (the default minifier) drops unprefixed backdrop-filter, the 100vh fallbacks and the loading headline's font; ~10 kB gzipped either way
    cssMinify: false,
    // a data file or loading screen is always a file of its own, never a data: URL in the code, however small
    assetsInlineLimit: file => (normalizePath(file).startsWith(DATA) ? false : undefined),
    rolldownOptions: {
      output: {
        ...names,
        // three.js in chunks of its own, apart from our code (three-core, three, three-addons: its two build files and the
        // addons, each under 500 kB): an edit to js/cities.ts or materials.js, which shared chunks with it, no longer renames it
        codeSplitting: { groups: [
          { name: 'three-core', test: /[\\/]node_modules[\\/]three[\\/]build[\\/]three\.core\.js$/, priority: 3 },
          { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]build[\\/]/, priority: 2 },
          { name: 'three-addons', test: /[\\/]node_modules[\\/]three[\\/]examples[\\/]/, priority: 1 },
        ] },
      },
    },
  },
  // Vitest (npm test): the unit tests in test/ run in Node, without a browser
  test: { include: ['test/**/*.test.js'], environment: 'node' },
});
