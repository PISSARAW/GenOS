'use strict';

const assert = require('node:assert/strict');
const { importAgentSocietyTrace, importGenosTrace } = require('./trace-adapter.cjs');

const row = { runId: 'run-1', scenarioId: 'pilot-10x100', seed: 7, armId: 'agentsociety', taskId: 'task-1',
  model: 'same-model', provider: 'same-provider', agentId: 'agent-1',
  verification: { status: 'verified', verifierId: 'oracle-1', independent: true }, informationLost: false,
  episodeCostsUsd: { verificationUsd: 0.01, memoryUsd: 0, planningUsd: 0, retryUsd: 0, transportUsd: 0, computeUsd: 0 },
  modelCallsComplete: true, modelCalls: [], usageReceipts: [] };
const expected = { runId: 'run-1', scenarioId: 'pilot-10x100', seed: 7, model: 'same-model',
  provider: 'same-provider', taskIds: ['task-1'] };
const external = importAgentSocietyTrace(JSON.stringify(row), expected);
assert.equal(external.tasks[0].episodeCostUsd, 0.01);
assert.equal(external.sourceSystem, 'agentsociety');
assert.equal(importGenosTrace(JSON.stringify({ ...row, armId: 'genos-d-full' }),
  { ...expected, armId: 'genos-d-full' }).tasks.length, 1);
assert.throws(() => importAgentSocietyTrace(JSON.stringify(row), { ...expected, taskIds: ['task-1', 'task-2'] }));
assert.throws(() => importAgentSocietyTrace(JSON.stringify({ ...row,
  verification: { status: 'verified', verifierId: 'self', independent: false } }), expected));
console.log('communication-economy trace adapters: ok');
