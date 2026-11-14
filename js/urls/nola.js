// New Orleans's data files (data/nola/): the URL each one has, keyed by its path on disk (/data/nola/<file>).
// In a build that is a content-hashed copy under /assets/ (vite.config.js); the dev server serves data/nola/
// as it is. A small chunk of its own, which js/main.js loads (URLS) before the city's code.
export default import.meta.glob('/data/nola/*', { query: '?url', import: 'default', eager: true });
