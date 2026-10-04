'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateHolobiontContracts } = require('../src/db/migrations/migrateHolobiontContracts');
const { migrateHolobiontMemory } = require('../src/db/migrations/migrateHolobiontMemory');
const { migrateHolobiontLedger } = require('../src/db/migrations/migrateHolobiontLedger');
const { migrateHolobiontImmunePlane } = require('../src/db/migrations/migrateHolobiontImmunePlane');
const { migrateHolobiontVariantEvents } = require('../src/db/migrations/migrateHolobiontVariantEvents');
const { runVariantMission, preflightVariantMission } = require('../src/services/holobionte/variants/variantMissionExecutor');
const { MorphologyRuntime } = require('../src/services/morphogenesis/runtime/morphologyRuntime');
const { compileExpression } = require('../src/services/morphogenesis/graph/morphologyCompiler');
const { topologyExpression } = require('../src/services/morphogenesis/expression');

const FIT = { capabilities: ['stable-core', 'diversity', 'cloud-core', 'edge-symbionts',
  'cloud-proxy', 'persistent-memory', 'verified-trials', 'tool-sandbox', 'edge-sync', 'provenance-verification'],
localEngineAvailable: true, immunePlaneAvailable: true, successionAvailable: true };

async function migrate(db) {
  await migrateHolobiontSessions(db);
  await migrateHolobiontContracts(db);
  await migrateHolobiontMemory(db);
  await migrateHolobiontLedger(db);
  await migrateHolobiontImmunePlane(db);
  await migrateHolobiontVariantEvents(db);
}

function missionInput(missionId) {
  return { missionId, hostId: 'longitudinal-host', persistentHost: true, variantId: 'local-first',
    fitContext: FIT, availableEngines: ['local'], executionBudget: { tokens: 1000, costUsd: 1, latencyMs: 5000, events: 10 },
    evidenceRefs: [`proof:${missionId}`], verifyEvaluationEvidence: async ({ evidenceRefs }) => evidenceRefs.length === 1,
    verifyMission: async () => ({ verdict: 'PASS', verifierIds: ['verifier-a', 'verifier-b'],
      assertions: [{ id: 'local-only', status: 'PASS', evidenceRefs: [`proof:${missionId}`] }] }),
    verifierIds: ['verifier-a', 'verifier-b'],
    variantOperations: [{ operation: 'planPlacement', runtimeInput: { availableEngines: ['local'], dataClasses: ['PUBLIC'] } }] };
}

async function main() {
  const preflight = preflightVariantMission(missionInput('preflight'));
  assert.equal(preflight.ready, true);
  assert.equal(preflight.verifierCount, 2);
  const blockedPreflight = preflightVariantMission({ missionId: 'incomplete', hostId: 'host', variantId: 'local-first' });
  assert.equal(blockedPreflight.ready, false);
  assert.ok(blockedPreflight.blockers.length >= 4);
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrate(db);
    const telemetry = { emitEvent: () => ({}) };
    const graph = compileExpression(topologyExpression('holobionte', 'local-first'), { missionId: 'mission-one' });
    const firstResult = await new MorphologyRuntime().execute(graph,
      { ...missionInput('mission-one'), db, telemetry });
    const first = firstResult.output;
    const second = await runVariantMission(db, { ...missionInput('mission-two'), telemetry });
    assert.equal(first.verdict, 'PASS');
    assert.equal(first.missionOutcome, 'verified');
    assert.equal(first.hostReused, false);
    assert.equal(second.hostReused, true);
    assert.equal(second.hostId, first.hostId);
    assert.equal(second.workflow.status, 'COMPLETED');
    const links = await db.all('SELECT mission_id FROM holobiont_mission_links WHERE host_id = ? ORDER BY mission_id', first.hostId);
    assert.deepEqual(links, [{ mission_id: 'mission-one' }, { mission_id: 'mission-two' }]);
    const uncertain = await runVariantMission(db, { ...missionInput('mission-three'), telemetry, verifyMission: undefined });
    assert.equal(uncertain.verdict, 'INCONCLUSIVE');
  } finally {
    await db.close();
  }
  console.log('Holobiont variant mission execution: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
