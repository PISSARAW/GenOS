'use strict';
const assert = require('node:assert/strict');
const { workerPolicy } = require('../bin/directWorkerPolicy.cjs');
const names = ['GENOS_ALLOWED_COMMANDS_JSON', 'GENOS_ALLOW_FILE_EDITS', 'GENOS_SILENT_UPDATES'];
const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
try {
  process.env.GENOS_ALLOWED_COMMANDS_JSON = '[" pytest ","pytest"]';
  process.env.GENOS_ALLOW_FILE_EDITS = 'true';
  process.env.GENOS_SILENT_UPDATES = '1';
  assert.deepEqual(workerPolicy().allowedCommands, ['pytest']);
  assert.equal(workerPolicy().allowFileEdits, true);
  assert.equal(workerPolicy().silentUpdates, true);
  const request = { allowed_commands: ['node test.cjs'], allowedCommands: ['npm test'],
    allow_file_edits: false, allowFileEdits: true, allowed_write_paths: ['src/a.js'],
    allowedWritePaths: ['src/b.js'], executionPolicy: { allowedCommands: ['cargo test'],
      allowedWritePaths: ['src/c.js'], allowFileEdits: true, gqwfV2: true, gqwfMaterializer: 'copy' } };
  assert.deepEqual(workerPolicy(request), { allowedCommands: ['node test.cjs'], allowFileEdits: false,
    allowedWritePaths: ['src/a.js'], silentUpdates: true, gqwfV2: true, gqwfMaterializer: 'copy' });
  assert.deepEqual(workerPolicy({ allowedCommands: 'invalid' }).allowedCommands, []);
  assert.equal(workerPolicy({ allowedWritePaths: 'invalid' }).allowedWritePaths, undefined);
  assert.deepEqual(workerPolicy({ executionPolicy: { allowedCommands: ['npm test'] } }).allowedCommands, ['npm test']);
  process.env.GENOS_ALLOWED_COMMANDS_JSON = 'not-json';
  assert.deepEqual(workerPolicy().allowedCommands, []);
} finally {
  for (const name of names) {
    if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
  }
}
console.log('Direct worker policy precedence and fail-closed parsing: PASS');
