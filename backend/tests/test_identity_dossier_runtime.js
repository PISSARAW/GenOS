'use strict';

const assert = require('assert');
const { buildAgentSelf, validateAgentSelf } = require('../src/services/agentSelfService');
const { buildWorkerSelf, validateWorkerSelf } = require('../src/services/workerSelfService');
const { checkedWorkerSelfBlock } = require('../src/services/workerIdentityGuardService');

function fakeDb(agent) {
  return {
    get: async (sql) => sql.includes('FROM agents') ? agent : null,
    all: async () => [],
    run: async () => ({ changes: 1 }),
    exec: async () => {}
  };
}

async function run() {
  const row = { id: 'worker-test-1', name: 'Ayo', role: 'reviewer',
    execution_mode: 'worker', status: 'running',
    created_at: '2026-10-14T08:00:00Z', parent_agent_id: 'orchestrator-1' };
  const db = fakeDb(row);
  const self = await buildAgentSelf(db, row.id);
  assert(validateAgentSelf(self).valid);
  assert.strictEqual(self.identityDossier.dimensions.existence.value.agentId, row.id);
  assert.strictEqual(self.identityDossier.dimensions.biology.status, 'unknown');
  assert.strictEqual(self.identityDossier.dimensions.characteristics.status, 'unknown');
  assert.strictEqual(self.identityDossier.dimensions.experience.status, 'known');
  const worker = await buildWorkerSelf(db, { agentId: row.id, workerRole: 'reviewer' });
  assert(validateWorkerSelf(worker).valid);
  assert.strictEqual(worker.identityDossier.agentId, row.id);
  assert.strictEqual(worker.identityDecision.mayAct, true);
  const prompt = await checkedWorkerSelfBlock(db,
    { agentId: row.id, role: 'reviewer', prompt: 'review' });
  assert(prompt.includes('WORKER SELF'));
  assert(prompt.includes('biology: unknown'));
  assert(prompt.includes('continuity: known'));
  const inactive = fakeDb({ ...row, status: 'terminated' });
  await assert.rejects(() => checkedWorkerSelfBlock(inactive,
    { agentId: row.id, role: 'reviewer', prompt: 'review' }),
  error => error.code === 'WORKER_IDENTITY_INACTIVE');
  await assert.rejects(() => checkedWorkerSelfBlock(fakeDb(null),
    { agentId: row.id, role: 'reviewer', prompt: 'review' }),
  error => error.code === 'WORKER_IDENTITY_UNAVAILABLE');
  console.log('Identity dossier runtime: AgentSelf and WorkerSelf passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
