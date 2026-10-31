'use strict';

const assert = require('node:assert/strict');
const { recordCompletedCommand, attestCodeTestResults, verifiedTestResults } = require('../src/services/agentCodeExecutionEvidence');

const state = { missionDomainState: {} };
const event = { id: 'event-test-1', action: 'command_execution', payload: {
  type: 'item.completed', item: { id: 'item-test-1', type: 'command_execution', status: 'completed',
    exit_code: 0, command: 'npm test', aggregated_output: 'all tests passed' }
} };
recordCompletedCommand(state, event, 'AGENT_STEP');
const report = { outcome: 'success', claims: [{ statement: 'npm test passed.', evidence: ['exec:test-1'] }],
  tests: [{ name: 'npm test', passed: true, evidenceRefs: ['exec:test-1'] }] };
attestCodeTestResults(report, state);
const verified = verifiedTestResults(report, state);
assert.equal(verified.length, 1);
assert.deepEqual(verified[0], { command: 'npm test', exitCode: 0, signal: null, stdout: '', stderr: '' });

const forged = structuredClone(report);
forged.tests[0].executionReceipt.outputDigest = '0'.repeat(64);
assert.deepEqual(verifiedTestResults(forged, state), [], 'receipt must match the completed runtime event');
assert.deepEqual(verifiedTestResults({ outcome: 'success', tests: [{ name: 'npm test', passed: true,
  exitCode: 0, executionReceipt: { eventId: 'missing', itemId: 'missing', exitCode: 0 } }] }, state), []);
process.stdout.write('Attested runtime test evidence is bound to completed command receipts: PASS\n');
