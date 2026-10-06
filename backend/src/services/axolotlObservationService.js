'use strict';
const crypto = require('node:crypto');
const store = require('./axolotlStateStore');
const nursery = require('./axolotlNurseryService');
async function observe(input) {
  await store.ensure(input.db);
  await store.assertOwner(input.db, input.orchestratorId);
  const active = await store.activeTopology(input.db, input.orchestratorId);
  if (!active?.functionalContract) throw store.error('AXOLOTL_ACTIVE_CONTRACT_REQUIRED');
  const mode = await require('./axolotlTopologyService').getTopologyModeDurable(input.orchestratorId, { db: input.db });
  const result = await nursery.evaluate({ topology: active.topology, contract: active.functionalContract, budget: nursery.validateBudget(input.executionBudget) });
  const observation = { sessionId: active.sessionId || `observation_${input.orchestratorId}`, orchestratorId: input.orchestratorId,
    runId: crypto.randomUUID(), observedAt: Date.now(), subjectHash: store.hash(active.topology),
    contractHash: store.hash(active.functionalContract), mode: mode.mode, result };
  return store.transaction(input.db, async (tx) => {
    const current = await store.read(tx, { kind: 'topology', id: input.orchestratorId });
    if (current.version !== active.version) throw store.error('AXOLOTL_OBSERVATION_STALE');
    const evidenceRef = await store.putEvidence(tx, observation);
    await store.write(tx, { kind: 'observation', id: observation.runId, value: { ...observation, evidenceRef } });
    return { success: result.passed, evidenceRef, observation };
  });
}
async function costReport(input) {
  await store.assertOwner(input.db, input.orchestratorId);
  const observations = (await store.list(input.db, 'observation')).filter((item) => item.orchestratorId === input.orchestratorId);
  const sessions = (await store.list(input.db, 'session')).filter((item) => item.orchestratorId === input.orchestratorId);
  return { success: true, observations: observations.length, regenerationCosts: sessions.map((item) => ({ sessionId: item.id, status: item.status, cost: item.cost || item.experimentCost || null })),
    comparison: require('./axolotlRegenerationCostService').compareObservations(observations) };
}
module.exports = { observe, costReport };
