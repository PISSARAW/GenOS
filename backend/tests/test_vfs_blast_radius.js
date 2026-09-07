const assert = require('assert');
const { dryRunPatch } = require('../src/services/vfsSandboxService');

assert.throws(
  () => dryRunPatch('workspace', [
    { path: 'src/a.js', content: 'A' },
    { path: './src/a.js', content: 'B' }
  ]),
  /duplicate target path/
);

const result = dryRunPatch('workspace', [{ path: 'src\\b.js', content: 'B' }]);
assert.deepStrictEqual(result.sideEffects.filesCreated, ['src/b.js']);
assert.strictEqual(result.clean, true);

for (const invalidCount of [-1, 1.5, NaN, Infinity, '1']) {
  assert.throws(() => require('../src/services/vfsSandboxService').calculateBlastRadius(invalidCount, false, 'viewer'), /filesModified must be a non-negative integer/);
}

for (const unsafePath of ['../secret', '/tmp/x', 'C:/tmp/x', 'safe/../secret']) {
  assert.throws(() => require('../src/services/vfsSandboxService').simulateDryRun('genos_create', { path: unsafePath, content: 'x' }), /Path escapes the workspace/);
}

console.log('VFS blast-radius collision checks passed.');