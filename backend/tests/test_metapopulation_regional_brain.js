'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const metapopulation = require('../src/services/metapopulationCoordinationService');

function observedRegion() {
  return {
    revision: 4,
    demes: [
      { demeId: 'deme-a', status: 'ACTIVE', fitness: { score: 0.2 }, capabilities: ['formal-proof'], localStrategies: ['strategy-a'] },
      { demeId: 'deme-b', status: 'ACTIVE', fitness: { score: 0.9 }, capabilities: ['search'], localStrategies: ['strategy-b'] }
    ],
    patches: [{ patchId: 'patch-empty', status: 'VACANT' }],
    corridors: [
      { sourceDemeId: 'deme-a', targetDemeId: 'deme-b', enabled: true, weight: 0.8, homogenizationRisk: 0 },
      { sourceDemeId: 'deme-b', targetDemeId: 'deme-a', enabled: true, weight: 0.8, homogenizationRisk: 0 }
    ],
    liveness: { demes: [
      { demeId: 'deme-a', silence: 'HEALTHY_SILENCE' },
      { demeId: 'deme-b', silence: 'HEALTHY_SILENCE' }
    ] },
    contribution: { demes: [{ demeId: 'deme-a', protectedFromLocalCull: true }] },
    synchrony: { affectedPairs: [{ sourceDemeId: 'deme-a', targetDemeId: 'deme-b', risk: 0.9 }] },
    utility: { capacity: { value: 1.2 } }
  };
}

function unitChecks() {
  const observed = observedRegion();
  const diagnosis = metapopulation.diagnoseRegion(observed, { requiredCapabilities: ['formal-proof', 'cryptography'] });
  assert.equal(diagnosis.status, 'CAPABILITY_GAP');
  assert.deepEqual(diagnosis.missingCapabilities, ['cryptography']);
  assert.equal(diagnosis.atRisk[0].demeId, 'deme-a');
  assert.equal(diagnosis.atRisk[0].protectedFromCull, true);
  assert.deepEqual(diagnosis.vacantPatches, ['patch-empty']);

  const plan = metapopulation.planRegionalActions(diagnosis, observed, {});
  assert.deepEqual(plan.actions.map((action) => action.type), ['MARK_DEME_AT_RISK', 'REGULATE_CORRIDORS']);
  assert.equal(plan.actions[1].pairs.length, 2, 'both directed corridors are considered');
  assert.ok(plan.recommendations.some((item) => item.type === 'ASSESS_RECOLONIZATION'));

  const brain = metapopulation.createRegionalBrain({ db: {} });
  assert.deepEqual(['observe', 'diagnose', 'plan', 'execute', 'verify'].filter((key) => typeof brain[key] !== 'function'), []);
}

async function runtimeChecks() {
  const database = require('../src/db');
  const migrationAdapters = require('../src/services/metapopulation/migration/migrationAdapterRegistry');
  const dbPath = path.join(os.tmpdir(), `genos-regional-brain-${process.pid}-${Date.now()}.db`);
  process.env.NODE_ENV = 'test';
  process.env.GENOS_ADMIN_PASSWORD ||= 'regional-brain-test-password';
  process.env.GENOS_AGENT_GIT_SIGNING_SECRET ||= 'regional-brain-test-signing-secret';
  let acceptPropagule = true;
  try {
    const db = await database.getDatabase(dbPath);
    const session = await metapopulation.createMetapopulationSession('Protect regional capability coverage.', { db });
    const sessionId = session.metapopulationId;
    await metapopulation.createPatch(sessionId, { patchId: 'patch-fragile', environment: {}, requirements: [],
      resources: {}, carryingCapacity: 4, quality: 0.7, accessibility: 0.8 }, { db });
    await metapopulation.createDeme(sessionId, { demeId: 'deme-fragile', patchId: 'patch-fragile',
      fitness: { score: 0.2 }, localStrategies: ['formal-proof'] }, { db });
    await metapopulation.createPatch(sessionId, { patchId: 'patch-source', environment: {}, requirements: [],
      resources: {}, carryingCapacity: 4, quality: 0.9, accessibility: 0.9 }, { db });
    await metapopulation.createDeme(sessionId, { demeId: 'deme-source', patchId: 'patch-source',
      fitness: { score: 0.9 }, localStrategies: ['search'] }, { db });
    await metapopulation.transitionDeme({ sessionId, demeId: 'deme-fragile', status: 'ESTABLISHING' }, { db });
    await metapopulation.transitionDeme({ sessionId, demeId: 'deme-fragile', status: 'ACTIVE' }, { db });
    await metapopulation.transitionDeme({ sessionId, demeId: 'deme-source', status: 'ESTABLISHING' }, { db });
    await metapopulation.transitionDeme({ sessionId, demeId: 'deme-source', status: 'ACTIVE' }, { db });
    await metapopulation.applyMigrationTopology(sessionId, { db, policy: 'fully-connected', metrics: {
      'deme-source->deme-fragile': { compatibility: 1 }, 'deme-fragile->deme-source': { compatibility: 1 }
    } });

    const result = await metapopulation.runAutonomousRegionalRuntime({ metapopulationId: sessionId, maxCycles: 1 }, { db });
    assert.equal(result.status, 'LIMIT_REACHED', JSON.stringify(result));
    assert.equal(result.cycles[0].status, 'VERIFIED');
    assert.equal(result.cycles[0].actionCount, 1);
    assert.equal((await metapopulation.getDeme(sessionId, 'deme-fragile', { db })).status, 'AT_RISK');

    metapopulation.registerMigrationAdapter('STRATEGY', {
      validate: async () => acceptPropagule ? { valid: true, evidence: { receiverTrial: 'passed' } }
        : { valid: false, evidence: { receiverTrial: 'rejected' }, reason: 'Receiver rejected strategy.' },
      assimilate: async ({ migration }) => ({ receiptId: `receipt-${migration.migrationId}`,
        provenance: { receiver: migration.targetDemeId, verified: true } })
    });
    const waiting = await metapopulation.runAutonomousRegionalRuntime({ metapopulationId: sessionId,
      maxCycles: 1, ...migrationCycle('propagule-waiting', false) }, { db });
    assert.equal(waiting.cycles[0].status, 'VERIFIED');
    assert.equal(waiting.cycles[0].actionCount, 0, 'migration trigger remains a required gate');
    const uneconomic = await metapopulation.runAutonomousRegionalRuntime({ metapopulationId: sessionId,
      maxCycles: 1, ...migrationCycle('propagule-uneconomic', true, false) }, { db });
    assert.equal(uneconomic.cycles[0].status, 'VERIFIED');
    assert.equal(uneconomic.cycles[0].actionCount, 0, 'negative migration utility must block the offer');

    const accepted = await metapopulation.runAutonomousRegionalRuntime({ metapopulationId: sessionId,
      maxCycles: 1, ...migrationCycle('propagule-accepted') }, { db });
    assert.equal(accepted.cycles[0].status, 'VERIFIED');
    assert.equal(accepted.cycles[0].verification.valid, true);
    assert.equal(accepted.cycles[0].actionCount, 1);

    acceptPropagule = false;
    const rejected = await metapopulation.runAutonomousRegionalRuntime({ metapopulationId: sessionId,
      maxCycles: 1, ...migrationCycle('propagule-rejected') }, { db });
    assert.equal(rejected.cycles[0].status, 'VERIFIED');
    assert.equal(rejected.cycles[0].actionCount, 1);
    const events = await metapopulation.listMetapopulationEvents(sessionId, { db });
    assert.ok(events.some((event) => event.type === 'REGIONAL_CYCLE_RECORDED'));
    assert.ok(events.some((event) => event.type === 'MIGRATION_ACCEPTED'));
    assert.ok(events.some((event) => event.type === 'MIGRATION_REJECTED'));
    assert.deepEqual(await metapopulation.listPropaguleQuarantine({ metapopulationId: sessionId,
      targetDemeId: 'deme-fragile' }, { db }), []);
  } finally {
    migrationAdapters.clearAdapter('STRATEGY');
    await database.closeDatabase();
    for (const suffix of ['', '-wal', '-shm']) await fs.rm(`${dbPath}${suffix}`, { force: true });
  }
}

function migrationCycle(propaguleId, triggered = true, worthwhile = true) {
  return { enableMigration: true, migrationRequests: [{ sourceDemeId: 'deme-source', targetDemeId: 'deme-fragile',
    policy: 'complementary', trigger: { stagnationGenerations: triggered ? 5 : 0 }, receiver: { demeId: 'deme-fragile' },
    candidates: [{ propaguleId, type: 'STRATEGY', sourceDemeId: 'deme-source', targetDemeId: 'deme-fragile',
      payloadRef: `strategy:${propaguleId}`, migrationReason: 'regional-adaptation', lineageRefs: ['lineage-source'],
      sourceEvidence: [{ kind: 'VERIFIED' }], provenance: { source: 'regional-brain-test' },
      sourceFitness: 0.9, novelty: 0.8, complementarity: 0.9, expectedReceiverGain: worthwhile ? 0.8 : 0.05,
      transferCost: worthwhile ? 0.1 : 0.2, assimilationRisk: 0.1, homogenizationRisk: 0.1 }]
  }] };
}

async function main() {
  unitChecks();
  await runtimeChecks();
  console.log('Metapopulation regional brain checks: PASS');
}

main().catch((error) => { console.error(error); process.exit(1); });
