// Jersey Shore's data files and loading screens (data/jsh/): the URL each one has, keyed by its path on disk
// (/data/jsh/<file>). In a build that is a content-hashed copy under /assets/ (vite.config.js); the dev server
// serves data/jsh/ as it is. A small chunk of its own, which js/main.js loads (URLS) before the city's code.
export default import.meta.glob('/data/jsh/*', { query: '?url', import: 'default', eager: true });
