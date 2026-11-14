// The perf-mode build of one side, for tools/perf/perf.py (see tools/perf/README.md, "Sides").
//
//   node tools/perf/build.mjs <side folder> <out folder> '<json>'     (with the side folder as the working
//   directory: the bundle's module comments are relative to it, so every side's bundle reads alike)
//
// Loads the side's own vite.config.js with the side's own installed vite, and builds it as production does
// (same plugins, same chunking), with the harness's overrides: not minified, source maps whose sources are
// root-relative (js/…, node_modules/…), fixed file names, symlinks kept (node_modules is a link to
// perf.py's cache, so every side's bundle reads the same), and a plugin that applies perf.py's patches to
// three's core file. The patch text comes from perf.py in <json>: { find, replace, append }, the same strings
// its CDN route applies to the no-build sides, so both sides of an A/B are patched by the same code.
// Prints {"patched": n}, the number of files the patch applied to.
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const [rootArg, outDir, json] = process.argv.slice(2), root = resolve(rootArg);
const opt = JSON.parse(json);
const vite = await import(pathToFileURL(createRequire(join(root, 'package.json')).resolve('vite')).href);
const loaded = await vite.loadConfigFromFile({ command: 'build', mode: 'production', isSsrBuild: false, isPreview: false }, undefined, root, 'warn');

let patched = 0;
const patch = {
  name: 'perf-harness-patches',
  transform(code, id) {
    // three's core file (three.module.js up to r170, three.core.js since): the one that holds generateUUID
    if (!/[\\/]node_modules[\\/]three[\\/]build[\\/][^\\/]+\.js$/.test(id.split('?')[0]) || !code.includes(opt.find)) return null;
    patched++;
    // the code before the end keeps its lines, so the source map stays right (map: null = positions unchanged)
    return { code: code.replace(opt.find, opt.replace) + (opt.append || ''), map: null };
  },
};
const names = { entryFileNames: 'assets/[name].js', chunkFileNames: 'assets/[name].js', assetFileNames: 'assets/[name][extname]' };
await vite.build(vite.mergeConfig(loaded ? loaded.config : {}, {
  configFile: false, root, mode: 'production', logLevel: 'warn',
  resolve: { preserveSymlinks: true },
  plugins: [patch],
  build: {
    outDir: resolve(outDir), emptyOutDir: true, minify: false, sourcemap: true, chunkSizeWarningLimit: 1e9,
    rolldownOptions: { output: { ...names, sourcemapPathTransform: (rel, map) => relative(root, resolve(dirname(map), rel)).split(sep).join('/') } },
  },
}));
console.log(JSON.stringify({ patched }));
