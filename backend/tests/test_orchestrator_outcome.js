const assert = require('node:assert/strict');
const { summarizeAgents } = require('../src/services/orchestratorOutcome');

assert.deepEqual(summarizeAgents([{ status: 'completed' }]), { success: true, verdict: 'completed' });
assert.deepEqual(summarizeAgents([{ status: 'unverified' }]), { success: false, verdict: 'unverified' });
assert.deepEqual(summarizeAgents([{ status: 'completed' }, { status: 'failed' }]), { success: false, verdict: 'failed' });
assert.deepEqual(summarizeAgents([]), { success: false, verdict: 'incomplete' });
console.log('Orchestrator outcomes distinguish completed, unverified and failed missions.');
