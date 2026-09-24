'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createSession('Freshness and backpressure.', {
    schema: { fields: [
      { path: 'docs.summary', dataType: 'LWW_REGISTER', ownerDomain: 'docs', maxStalenessMs: 5000 },
      { path: 'security.verdict', dataType: 'LWW_REGISTER', ownerDomain: 'security', consistencyZone: 'SERIALIZABLE', maxStalenessMs: 0 }
    ] },
    nuclearDomains: [
      { domainId: 'docs', members: ['writer'], owns: ['docs.*'], maxStalenessMs: 10000 },
      { domainId: 'security', members: ['guard'], owns: ['security.*'] }
    ]
  });

  const pressured = await syncytium.applyOperation(session.sessionId, {
    opId: 'docs-summary', actorId: 'writer', domainId: 'docs', priority: 'low',
    kind: { type: 'set_field', key: 'docs.summary', value: 'updated' }
  }, { syncTelemetry: {
    nowMs: 10000, lastSeenMs: { docs: 9990 }, queueDepth: 2000,
    consumerLagMs: 6000, opsProducedPerSec: 100, opsAppliedPerSec: 20
  } });
  assert.equal(pressured.syncPlan.pressure.status, 'PRESSURED');
  assert.equal(pressured.syncPlan.recipients[0].freshness.status, 'FRESH');
  assert.equal(pressured.syncPlan.recipients[0].strategy, 'BATCH');

  const critical = await syncytium.applyOperation(session.sessionId, {
    opId: 'security-verdict', actorId: 'guard', domainId: 'security', priority: 'security',
    kind: { type: 'set_field', key: 'security.verdict', value: 'blocked' }
  }, { syncTelemetry: { nowMs: 10000, lastSeenMs: { security: 9000 }, queueDepth: 15000, consumerLagMs: 40000 } });
  assert.equal(critical.syncPlan.pressure.status, 'OVERLOADED');
  assert.equal(critical.syncPlan.recipients[0].freshness.stale, true);
  assert.equal(critical.syncPlan.recipients[0].strategy, 'IMMEDIATE');

  assert.throws(() => require('../src/services/syncytiumSchemaService').compile({
    fields: [{ path: 'x', maxStalenessMs: -1 }]
  }), (error) => error.code === 'SYNCYTIUM_SCHEMA_INVALID');
}

main().then(() => console.log('Syncytium adaptive sync checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
