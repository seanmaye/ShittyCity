// Philadelphia's data files and loading screens (data/phl/): the URL each one has, keyed by its path on disk
// (/data/phl/<file>). In a build that is a content-hashed copy under /assets/ (vite.config.js); the dev server
// serves data/phl/ as it is. A small chunk of its own, which js/main.js loads (URLS) before the city's code.
export default import.meta.glob('/data/phl/*', { query: '?url', import: 'default', eager: true });
