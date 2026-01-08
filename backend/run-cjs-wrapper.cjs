// Wrapper to run the compiled CommonJS server when package.json has "type": "module"
// Node treats .js as ESM when project is ESM; requiring the CJS bundle from a .cjs
// file forces CommonJS loading.
require('./dist/cjs/server.js');
