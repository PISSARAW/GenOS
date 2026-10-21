'use strict';

const assert = require('node:assert/strict');
const topologyHandler = require('../bin/topologyTrinityHandler.cjs');

const base = [{ variantSelection: { variant: 'adversarial' }, worldNumber: 1, modelTier: 'standard' }];
assert.equal(topologyHandler.withDispatchRuntime(base, {}).supervisionTimeoutMs, 180000);
assert.equal(topologyHandler.withDispatchRuntime(base, { timeoutMs: 420000 }).supervisionTimeoutMs, 420000);
assert.equal(topologyHandler.withDispatchRuntime(base, { trinitySupervisorTimeoutMs: 540000, timeoutMs: 420000 }).supervisionTimeoutMs, 540000);
assert.equal(topologyHandler.withDispatchRuntime(base, { timeoutMs: 1200000 }).supervisionTimeoutMs, 900000);
assert.equal(topologyHandler.shouldSkipExistingWorld({ status: 'queued' }, { status: 'idle', runtime_pid: null }), false);
assert.equal(topologyHandler.shouldSkipExistingWorld({ status: 'queued' }, { status: 'running', runtime_pid: 123 }), true);
assert.equal(topologyHandler.shouldSkipExistingWorld({ status: 'running' }, { status: 'idle', runtime_pid: null }), true);

const supervisor = require('../bin/trinity-supervisor.cjs');
assert.equal(supervisor.expectedWorlds({ experimentalDesign: { worldTopology: 'factorial_grid' } }), 16);
assert.equal(supervisor.expectedWorlds({ experimentalDesign: { worldTopology: 'fixed_three' } }), 3);
assert.throws(() => supervisor.requireSuccessfulWorkers([
  { status: 'completed' }, { status: 'error' }, { status: 'completed' }
], 3), { code: 'TRINITY_WORLD_EXECUTION_INCOMPLETE' });
supervisor.requireSuccessfulWorkers([
  { status: 'completed' }, { status: 'completed_unpromoted' }, { status: 'completed' }
], 3);
async function verifyBlockedPromotionStillSupervisesEvidence() {
  const db = { get: async () => ({ id: 'run-1', status: 'blocked',
    guardrail_reason: 'Promotion gate blocked (require_independent_verification).' }),
  all: async () => [{ event_type: 'AGENT_COMPLETED', payload_json: JSON.stringify({
    executionRunId: 'run-1', evidenceReport: { outcome: 'success', claims: [{ statement: 'Observed', evidence: ['mission'] }] }
  }) }] };
  const worker = await supervisor.assessWorkerExecution(db, { agentId: 'worker-1', status: 'error' });
  assert.equal(worker.status, 'completed_unpromoted');
  assert.equal(worker.promotionBlocked, true);
  const invalid = await supervisor.assessWorkerExecution({ ...db,
    get: async () => ({ id: 'run-2', status: 'blocked', guardrail_reason: 'budget exhausted' })
  }, { agentId: 'worker-2', status: 'error' });
  assert.equal(invalid.status, 'blocked');
  assert.equal(invalid.guardrailReason, 'budget exhausted');
}
async function verifyTerminalRunOverridesIdleProjection() {
  const db = {
    all: async (query) => query.includes('FROM trinity_worlds')
      ? [{ agentId: 'worker-1', status: 'idle' }]
      : [],
    get: async () => ({ id: 'run-budget', status: 'blocked',
      guardrail_reason: 'Codex shared model budget is unsupported.' })
  };
  const workers = await supervisor.waitForWorkers(db, {
    missionId: 'mission-budget', expectedWorlds: 1, timeoutMs: 5
  });
  assert.equal(workers[0].status, 'blocked');
  assert.equal(workers[0].executionRunId, 'run-budget');
  assert.throws(() => supervisor.requireSuccessfulWorkers(workers, 1), {
    code: 'TRINITY_WORLD_EXECUTION_INCOMPLETE'
  });
}
async function verifyUnpromotedWorkersAreTerminal() {
  const db = {
    all: async (query) => query.includes('FROM trinity_worlds')
      ? [{ agentId: 'worker-1', status: 'error' }]
      : [{ event_type: 'AGENT_COMPLETED', payload_json: JSON.stringify({
        executionRunId: 'run-1', evidenceReport: { outcome: 'success', claims: [] }
      }) }],
    get: async () => ({ id: 'run-1', status: 'blocked', guardrail_reason: 'Promotion gate blocked (require_replay): deterministic replay required.' })
  };
  const workers = await supervisor.waitForWorkers(db, { missionId: 'mission-1', expectedWorlds: 1, timeoutMs: 5 });
  assert.equal(workers[0].status, 'completed_unpromoted');
  assert.equal(workers[0].promotionBlockReason, 'require_replay');
}
assert.throws(() => supervisor.requireCompleteReports([
  { outcome: 'success', claims: [{}], tests: [], report: { outcome: 'success' } },
  { outcome: 'no_evidence', claims: [], tests: [], report: undefined },
  { outcome: 'success', claims: [{}], tests: [], report: { outcome: 'success' } }
], 3), { code: 'TRINITY_WORLD_EVIDENCE_INCOMPLETE' });

Promise.all([verifyBlockedPromotionStillSupervisesEvidence(), verifyUnpromotedWorkersAreTerminal(),
  verifyTerminalRunOverridesIdleProjection()]).then(() => {
  process.stdout.write('Trinity supervisor honors bounded timeouts and separates execution from promotion gates.\n');
}).catch((error) => { console.error(error); process.exitCode = 1; });
