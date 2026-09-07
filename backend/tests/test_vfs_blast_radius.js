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

console.log('VFS blast-radius collision checks passed.');