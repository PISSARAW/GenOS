const assert = require('node:assert/strict');
const { summarizeAgents } = require('../src/services/orchestratorOutcome');

assert.deepEqual(summarizeAgents([{ status: 'completed' }]), { success: true, verdict: 'completed', evidence: [] });
assert.deepEqual(summarizeAgents([{ status: 'unverified' }]), { success: false, verdict: 'unverified', evidence: [] });
assert.deepEqual(summarizeAgents([{ status: 'completed' }, { status: 'failed' }]), { success: false, verdict: 'failed', evidence: [] });
assert.deepEqual(summarizeAgents([]), { success: false, verdict: 'incomplete', evidence: [] });
assert.deepEqual(
  summarizeAgents([{ id: 'a1', status: 'completed', evidence_ref: 'ev1', capsule_ref: 'cap1', report: 'done' }]),
  { success: true, verdict: 'completed', evidence: [{ agent_id: 'a1', evidence_ref: 'ev1', capsule_ref: 'cap1', report: 'done', status: 'completed' }] }
);
console.log('Orchestrator outcomes distinguish completed, unverified and failed missions with evidence.');
