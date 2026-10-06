'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const fixtures = require('./helpers/gvxStandardFixture');
const ledger = require('../src/services/gvxDevelopmentLedger');
const controller = require('../src/services/gvxDevelopmentController');

async function seed(fixture) {
  const signal = { scope: fixtures.scope, entityId: fixtures.scope.entityId, agentId: fixtures.scope.entityId,
    sourceEventId: 'recovery-3', signalType: 'persistent_regret', evidenceRefs: ['functional-fixture'], context: {} };
  for (let index=1; index<=3; index+=1) await ledger.appendEvent(fixture.db, { ...fixtures.scope,
    type: 'evidence_attached', payload: { kind: 'developmental_signal', signalType: signal.signalType,
      sourceEventId: 'recovery-'+index, context: {} } });
  return signal;
}

async function main() {
  const fixture = await fixtures.createFixture();
  try {
    const signal = await seed(fixture);
    const adapters = await require('../src/services/gvxStandardLifecycleAdapters').createAdapters({ db: fixture.db, signal });
    let observations = 0;
    const original = adapters.monitorInput;
    adapters.monitorInput = async (input) => {
      const monitor = await original(input);
      const observe = monitor.runtime.observe;
      monitor.runtime.observe = async (id, window) => {
        observations+=1;
        if (observations===2) throw Object.assign(new Error('simulated interruption'), { code: 'FIXTURE_INTERRUPTION' });
        return observe(id,window);
      };
      return monitor;
    };
    await assert.rejects(controller.runCycle(fixture.db, { ...adapters, signal }), { code: 'FIXTURE_INTERRUPTION' });
    const prior = await ledger.listAllEvents(fixture.db, fixtures.scope);
    assert.equal(prior.filter((event) => event.payload.kind==='somatic_application').length, 1);
    assert.equal(prior.filter((event) => event.payload.kind==='developmental_credit_applied').length, 0);
    assert.equal((await fs.readdir(path.join(fixture.root, 'executions'))).length, 4);
    await fixture.db.close();
    fixture.db = await fixtures.openDatabase(fixture.filename);
    const resumed = await require('../src/services/gvxLifecycleAdapterProvider').runConfiguredCycle(fixture.db, signal);
    assert.equal(resumed.status, 'mature_somatic_eligible');
    assert.equal(resumed.plasticityCredit.credited, true);
    assert.equal((await fs.readdir(path.join(fixture.root,'executions'))).filter((name)=>name.endsWith('.json')).length,8);
    const events=await ledger.listAllEvents(fixture.db, fixtures.scope);
    assert.equal(events.filter((event)=>event.payload.kind==='somatic_application').length,1);
    await assert.rejects(controller.runCycle(fixture.db, { ...adapters, signal, controlFingerprint:'a'.repeat(64) }),
      { code: 'GVX_CYCLE_CONTROLS_CHANGED' });
  } finally { await fixtures.closeFixture(fixture); }
  console.log('GVX standard recovery: interruption, durable resume and changed-controls rejection passed.');
}

main().catch((error)=>{console.error(error);process.exitCode=1;});
