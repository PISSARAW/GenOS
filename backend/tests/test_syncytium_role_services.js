'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const actors = Array.from({ length: 12 }, (_, index) => ({ actorId: `worker-${index}`, nucleusId: `nucleus-${index}` }));
  const session = await syncytium.createSession('Four services with a mission-sized executor pool.', {
    nuclearDomains: actors.map((actor) => ({
      domainId: actor.nucleusId, members: [actor.actorId], owns: [`results.${actor.actorId}`]
    }))
  });
  assert.equal(syncytium.catalog.parallel_executor.multiplicity, 'N');
  assert.equal(syncytium.catalog.shared_state_coordinator.plane, 'State Plane');
  assert.equal(syncytium.catalog.consistency_guardian.plane, 'Invariant/Security Plane');
  assert.equal(syncytium.catalog.integration_executor.plane, 'Materialization Plane');

  const nuclei = actors.map((identity) => syncytium.createExecutionNucleus(identity));
  assert.equal(nuclei.length, 12);
  for (const nucleus of nuclei) {
    await nucleus.execute(session.sessionId, {
      opId: `result-${nucleus.actorId}`,
      kind: { type: 'set_field', key: `results.${nucleus.actorId}`, value: 'complete' }
    });
  }
  const state = await syncytium.statePlane.snapshot(session.sessionId);
  assert.equal(Object.values(state.shared.sharedFields).filter((value) => value === 'complete').length, 12);
  assert.equal((await syncytium.consistencyGuardian.audit(session.sessionId)).verdict, 'consistent');
  const materialized = await syncytium.integrationExecutor.materialize(session.sessionId);
  assert.ok(materialized.stored.snapshotId);
  assert.equal((await syncytium.integrationExecutor.listSnapshots(session.sessionId)).length, 1);

  assert.throws(() => syncytium.createExecutionNucleus({ actorId: 'orphan' }),
    (error) => error.code === 'SYNCYTIUM_ROLE_SERVICE_INVALID');
}

main().then(() => console.log('Syncytium role service checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
