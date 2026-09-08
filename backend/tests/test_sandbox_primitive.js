const assert = require('node:assert/strict');
const safety = require('../src/services/primitiveHandlers/safety');

safety.sandbox({ workspaceId: 'ws-test', command: 'echo safe' }).then((result) => {
  assert.equal(result.success, true);
  assert.equal(result.result.dryRun, true);
  console.log('Sandbox primitive checks passed.');
}).catch((error) => { console.error(error); process.exitCode = 1; });