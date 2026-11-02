'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'windows-roster-protocol-test-only';
const assert = require('node:assert/strict');
const path = require('node:path');
const Database = require('better-sqlite3');
const fixture = require('./helpers/missionProtocolWindowsFixture');
const { runWindowsLocalExecution } = require('../bin/orchestratorWindowsLocalExecution.cjs');

async function main() {
  const { ctx, input } = await fixture.create();
  const observed = [];
  try {
    await require('./helpers/biologicalWorkerFixture').addWorker(ctx.db, { agentId: 'worker-two' });
    input.autonomyPlan = { dispatchWorkers: [
      { role: 'reader', workerKind: 'bounded_worker' }, { role: 'reviewer', workerKind: 'bounded_worker' }],
    workerRoster: { exact: true, requestedWorkers: 2 } };
    await assert.rejects(runWindowsLocalExecution(input, {
      createAutonomousWorkers: async (_db, _parent, options) => {
        assert.ok(options.mission.modelBudgetScope);
        return ['worker', 'worker-two'].map(agentId => ({ agentId, workspaceRoot: ctx.workspace,
          executionBudget: { tokens: 30, costUsd: 0.02, latencyMs: 20000 }, prompt: `Inspect assignment ${agentId}` }));
      },
      runLocalWorker: async (db, mission, run) => {
        const binding = await require('../src/services/missionProtocols/context').load(db, run.id);
        assert.equal(binding.mission.synapseContext.generation, 1);
        assert.equal(binding.mission.synapseContext.publisher.agentId, 'parent');
        assert.equal(binding.mission.synapseContext.receiver.agentId, mission.agentId);
        assert.equal(mission.requestTokenBudget, 30);
        assert.ok(mission.timeoutMs < 20000, 'ordinary time is bounded before sealing with protected reserve');
        const allocator = new Database(path.join(binding.directory, 'allostasis.sqlite'), { readonly: true });
        try {
          const allocation = JSON.parse(allocator.prepare('SELECT body FROM allostasis_allocations').get().body);
          assert.ok(allocation.unknownExposure > 0, 'actual durable exposure precedes the worker callback');
          assert.equal(allocation.allocation.regulator.agentId, 'parent');
        } finally { allocator.close(); }
        observed.push({ mission, run, binding });
        return { started: false, unresolved: true };
      }, runPostflight: async () => ({})
    }), error => error.code === 'WINDOWS_LOCAL_WORKER_INCOMPLETE');
    assert.equal(observed.length, 2);
    assert.equal(observed[0].mission.modelBudgetScope.id, observed[1].mission.modelBudgetScope.id);
    const scopes = await ctx.db.all('SELECT * FROM mission_model_budget_scopes');
    assert.equal(scopes.length, 1, 'worker creation does not mint independent parent capacity');
    assert.equal(scopes[0].parent_agent_id, 'parent');
    assert.equal(scopes[0].token_ceiling, 100); assert.equal(scopes[0].cost_ceiling_usd, 0.1);
    for (const { binding, run } of observed) {
      const allocator = new Database(path.join(binding.directory, 'allostasis.sqlite'), { readonly: true });
      try {
        const state = JSON.parse(allocator.prepare('SELECT body FROM mission_time_runtime WHERE id=?').get(run.id).body);
        assert.ok(state.finished, 'runInProcess settles measured usage even when the worker reports failure');
        const allocation = JSON.parse(allocator.prepare('SELECT body FROM allostasis_allocations').get().body);
        assert.equal(allocation.unknownExposure, 0); assert.equal(allocation.held, 0);
      } finally { allocator.close(); }
    }
    console.log('Windows real roster shares one native parent budget, applies SYNAPSE, exposes ALLOSTASIS before execution and finalizes usage: PASS');
  } finally { await ctx.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
