'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { decodeEvents } = require('../src/services/runtimeProtocol');

for (const mode of ['pass', 'fail', 'denied', 'invalid', 'declared-failure']) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-completion-regression-'));
  try {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'fixtures/localWorkerCompletionProbe.cjs'), root, mode],
      { timeout: 30000, windowsHide: true });
    assert.ifError(result.error);
    const events = [];
    const remainder = decodeEvents(result.stdout, event => events.push(event));
    assert.equal(remainder.length, 0);
    assert.equal(result.status, mode === 'pass' ? 0 : 1, result.stderr.toString());
    assert.equal(events.at(-1).eventType, mode === 'pass' ? 'AGENT_COMPLETED' : 'AGENT_FAILED');
    assert.equal(fs.existsSync(path.join(root, 'success-memory')), mode === 'pass',
      'Only a validated successful execution may persist a success memory');
    if (mode !== 'pass') assert.equal(events.some(event => event.eventType === 'AGENT_COMPLETED'), false);
    if (mode === 'fail') {
      const terminal = { ...events.at(-1), payload: JSON.parse(events.at(-1).payloadJson) };
      assert.equal(require('../src/services/workerFailureRecoveryService').classifyFailure(terminal), 'test_failure');
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
console.log('Local worker process: exit status, test refusal and success-memory gating passed.');
