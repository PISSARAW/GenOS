'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const fixtureTools = require('./helpers/gvxStandardFixture');
const ledger = require('../src/services/gvxDevelopmentLedger');
const signals = require('../src/services/developmentalBridge/agowToGvxSignalAdapter');
const { hash } = require('../src/services/gvxContracts');

function signal(index) {
  return { scope: fixtureTools.scope, entityId: fixtureTools.scope.entityId, agentId: fixtureTools.scope.entityId,
    sourceEventId: `fixture-source-${index}`, signalId: `fixture-signal-${index}`,
    signalType: 'persistent_regret', evidenceRefs: [`fixture-evidence-${index}`], context: { pathwayId: 'fixture-policy' } };
}

async function positiveCycle(fixture) {
  await signals.recordAgowSignal(fixture.db, signal(1));
  await signals.recordAgowSignal(fixture.db, signal(2));
  const first = await signals.recordAgowSignal(fixture.db, signal(3));
  if (first.developmentalCycle?.status === 'deferred') await require('../src/services/gvxLifecycleAdapterProvider').runConfiguredCycle(fixture.db, signal(3));
  assert.equal(first.developmentalCycle?.status, 'mature_somatic_eligible', JSON.stringify(first.developmentalCycle));
  assert.equal(first.developmentalCycle.plasticityCredit.credited, true);
  assert.equal(first.developmentalCycle.monitoring.results.length, 3);
  assert.equal(first.developmentalCycle.promotionAllowed, false);
  const actual = await require('../src/services/agow/agowMechanismPolicyService').load({
    db: fixture.db, agentId: fixtureTools.scope.entityId });
  assert.equal(hash(actual), hash(fixture.profile.candidatePolicy));
  const before = await ledger.listAllEvents(fixture.db, fixtureTools.scope);
  const creditIndex = before.findIndex((event) => event.payload.kind === 'developmental_credit_applied');
  const monitorIndex = before.findIndex((event) => event.payload.kind === 'gvx_longitudinal_monitor');
  assert.ok(creditIndex > monitorIndex);
  assert.equal((await fs.readdir(path.join(fixture.root, 'executions'))).filter((name) => name.endsWith('.json')).length, 8);
  await fixture.db.close();
  fixture.db = await fixtureTools.openDatabase(fixture.filename);
  const replay = await signals.recordAgowSignal(fixture.db, signal(3));
  assert.equal(replay.developmentalCycle.replayed, true);
  assert.equal((await ledger.listAllEvents(fixture.db, fixtureTools.scope)).length, before.length);
  assert.equal((await fs.readdir(path.join(fixture.root, 'executions'))).filter((name) => name.endsWith('.json')).length, 8);
  return first.developmentalCycle;
}

async function main() {
  const fixture = await fixtureTools.createFixture();
  try { const cycle = await positiveCycle(fixture); await require('./helpers/gvxAdversarialChecks').check(fixture, cycle); }
  finally { await fixtureTools.closeFixture(fixture); }
  console.log('GVX standard cycle: isolated evaluation, policy application, independent monitoring, credit and durable replay passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
