'use strict';
const assert = require('node:assert/strict');
const { openFixture, send, runtime } = require('./naturalSearchTestFixture');
const { CausalProgressService } = require('../../src/services/search/causalProgressService');

async function provenance(db) {
  const sensor = new CausalProgressService();
  sensor.ingestEvent({ eventType: 'AGENT_STEP', payload: { provenance: 'verified', evidenceGain: 1,
    constraintsResolved: 1, verifiedArtifactDelta: 1, objectiveDelta: 1, tokensConsumed: 1 } });
  assert.equal(sensor.report().global.evidenceGain, 0.3);
  assert.equal(sensor.report().global.constraintsResolved, 0.3);
  assert.equal(sensor.report().global.verifiedArtifactDelta, 0.3);
  assert.equal(sensor.report().global.objectiveDelta, 0.3);
  sensor.ingestEvent({ eventType: 'EVIDENCE_REPORT', payload: { provenance: 'verified', evidenceGain: 1 } });
  assert.equal(sensor.report().global.evidenceGain, 0.6);
  sensor.ingestEvent({ eventType: 'TOOL_RESULT', payload: { evidenceGain: 1 } });
  assert.equal(sensor.report().global.evidenceGain, 1.6);
  sensor.ingestEvent({ eventType: 'AGENT_STEP', payload: { evidenceGain: Infinity, tokensConsumed: -1 } });
  assert.equal(sensor.report().global.evidenceGain, 1.6);
  const state = await send(db, { type: 'HYPOTHESIS_PROPOSED', payload: { hypothesisId: 'claim', statement: 'cache' } });
  await send(db, { type: 'EVIDENCE_REPORT', payload: { hypothesisId: 'claim', evidenceRef: 'claimed', provenance: 'verified' } });
  assert.equal([...state.ledger.proofs.values()].at(-1).provenance, 'self_reported');
  await send(db, { type: 'TOOL_RESULT', payload: { hypothesisId: 'claim', evidenceRef: 'observed', provenance: 'verified' } });
  assert.equal([...state.ledger.proofs.values()].at(-1).provenance, 'observed');
  const saved = state.ledger.hypotheses.get('claim');
  await send(db, { type: 'HYPOTHESIS_PROPOSED', payload: { hypothesisId: 'claim', statement: 'overwrite' } });
  assert.equal(saved.statement, 'cache');
}

async function corruption(db) {
  await db.run(`INSERT INTO search_module_state(agent_id,module,state_json) VALUES ('receiver','genome','{broken')`);
  await assert.rejects(runtime.getOrCreateSearchState('receiver', db), /Corrupt/);
  await db.run(`UPDATE search_module_state SET state_json=? WHERE agent_id='receiver'`, JSON.stringify({ version: 2, payload: {} }));
  await assert.rejects(runtime.getOrCreateSearchState('receiver', db), /version/);
  await db.run(`DELETE FROM search_module_state WHERE agent_id='receiver'`);
  const restored = await runtime.getOrCreateSearchState('receiver', db);
  assert.ok(restored.actuator.searchGenome.genome);
  await runtime.clearSearchState('receiver');
  const p = restored.persistence;
  const checkpoint = await p.loadRuntimeCheckpoint('receiver');
  checkpoint.sensor.totals.globalEvidence = 'broken';
  await p.saveRuntimeCheckpoint('receiver', checkpoint);
  await assert.rejects(runtime.getOrCreateSearchState('receiver', db), /globalEvidence/);
  checkpoint.sensor.totals.globalEvidence = 0;
  checkpoint.modules.negative = [['broken', {}]];
  await p.saveRuntimeCheckpoint('receiver', checkpoint);
  await assert.rejects(runtime.getOrCreateSearchState('receiver', db), /negative/);
  await db.run(`DELETE FROM search_runtime_checkpoint WHERE agent_id='receiver'`);
}

async function culture(db) {
  const source = await runtime.getOrCreateSearchState('source', db);
  const cultureService = source.actuator.modules.cultureService;
  const genome = source.actuator.modules.getBestGenome();
  assert.equal(cultureService.compilePlasmid(genome, { successRate: 0.9, reproducible: true }), null);
  assert.equal(cultureService.compilePlasmid(genome, { successRate: 0.9, reproducible: true, evidenceRefs: ['x', 'x'] }), null);
  const family = genome.hypothesisFamily;
  const h = source.ledger.propose({ agentId: 'source', statement: `${family} validated` });
  for (const ref of ['run-1', 'run-2']) source.ledger.addEvidence(h.id,
    { evidenceRef: ref, strength: 2, provenance: 'observed', independent: true, reliability: 1 });
  assert.equal(h.status, 'supported');
  const validation = { genomeId: genome.id, successRate: 1, reproducible: true, evidenceRefs: ['run-1', 'run-2'] };
  const { handlePostReceiptMemory } = require('../../src/services/search/naturalSearchMemory');
  handlePostReceiptMemory({ searchState: source, agentId: 'source', selection: { process: 'EVOLUTION' },
    receipt: { status: 'success' }, searchCtx: { validatedSearchOutcomes: { cultureValidation: validation, targetAgentId: 'receiver' } } });
  assert.equal(cultureService.transmissions.length, 1);
  await runtime.flushSearchState('source');
  await runtime.clearSearchState('source');
  const receiver = await runtime.getOrCreateSearchState('receiver', db);
  assert.equal(receiver.actuator.modules.cultureService.received.size, 1);
  assert.equal(receiver.actuator.modules.cultureService.getCandidateTrait().hypothesisFamily, family);
  const variants = receiver.actuator.modules.createAffinityVariants(null, 4, 'minimal');
  assert.equal(variants.length, 4);
  assert.ok(variants.every(v => v.parentIds.includes(receiver.actuator.searchGenome.genome.id)));
  await runtime.clearSearchState('receiver');
  const resumed = await runtime.getOrCreateSearchState('receiver', db);
  assert.equal(resumed.actuator.modules.cultureService.received.size, 1);
  await db.run("UPDATE agents SET organization_id='other-org' WHERE id='receiver'");
  assert.equal((await source.persistence.loadIncomingCulture('receiver')).length, 0);
  await send(db, { agentId: 'receiver' });
  assert.equal(resumed.actuator.modules.cultureService.received.size, 0);
}

async function main() {
  const db = await openFixture(':memory:');
  try { await provenance(db); await corruption(db); await culture(db); }
  finally {
    for (const id of ['source', 'receiver']) await runtime.clearSearchState(id);
    await db.close();
  }
}
main().then(() => console.log('Natural Search provenance, corruption and durable culture passed.'))
  .catch(error => { console.error(error); process.exitCode = 1; });
