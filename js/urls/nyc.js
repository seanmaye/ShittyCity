// New York's data files and loading screens (data/nyc/): the URL each one has, keyed by its path on disk
// (/data/nyc/<file>). In a build that is a content-hashed copy under /assets/ (vite.config.js); the dev server
// serves data/nyc/ as it is. A small chunk of its own, which js/main.js loads (URLS) before the city's code.
export default import.meta.glob('/data/nyc/*', { query: '?url', import: 'default', eager: true });
