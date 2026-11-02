'use strict';
const fixture = require('./missionProtocolFixture');
const gqel = require('./gqelProgressFixture.cjs');
const execution = require('../../src/services/strategyExecutionService');
const authority = require('../../src/services/missionEnvelopeAuthority');

async function create(options = {}) {
  const ctx = await fixture.create(), contract = options.contract || gqel.contract();
  if (options.prepareWorkspace) await options.prepareWorkspace(ctx);
  const workerContract = { ...require('../../src/services/agents/workerKindService').buildWorkerContract('creative_worker', {
    prompt: contract.mission }), qualityElevation: contract,
  ...(options.runtime ? { qualityRuntime: options.runtime } : {}) };
  await ctx.db.run("UPDATE agents SET metadata_json = ?, role = 'creative_worker' WHERE id = 'worker'", JSON.stringify({ workerContract }));
  const run = await execution.createExecutionRun(ctx.db, { agentId: 'worker', missionId: 'worker-mission',
    contractRecord: ctx.contractRecord, budget: { tokens: 10000, costUsd: 1, latencyMs: 300000 } });
  const worker = { ...ctx.normalizedMission, workerKind: 'creative_worker', workerContract, executionRunId: run.id,
    ...(options.runtime ? { qualityRuntime: options.runtime } : {}) };
  await authority.seal({ ...ctx, normalizedMission: worker, executionRun: run });
  const text = options.text || gqel.GOOD;
  const result = await gqel.execute({ contract, initialContent: text, planScenes: false, ...options.execution });
  return { ...ctx, worker, result, executionRunId: run.id, text };
}

module.exports = { create };
