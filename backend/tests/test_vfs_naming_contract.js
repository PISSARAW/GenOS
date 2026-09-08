const assert = require('node:assert/strict');
const { normalizeFileArguments, simulateDryRun } = require('../src/services/vfsSandboxService');

assert.deepEqual(normalizeFileArguments({ path: 'src/app.js', content: '' }), { path: 'src/app.js', content: '' });
assert.throws(() => normalizeFileArguments({ TargetFile: 'src/app.js', CodeContent: 'x' }), /canonical path and content/);
assert.throws(() => normalizeFileArguments({ path: 'src/app.js' }), /string content/);
assert.throws(() => simulateDryRun('genos_create', { path: 'src/app.js', CodeContent: 'x' }), /canonical path and content/);

console.log('VFS naming contract: PASS');