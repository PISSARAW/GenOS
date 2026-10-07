'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const fixture = require('./capability_runtime_fixture');
const science = require('../src/services/scientificEvidenceLedger');
const bridge = require('../src/services/morphogenesis/capabilities/trinityMeristemBridge');
const waves = require('../src/services/morphogenesis/capabilities/experimentWaveRuntime');

async function prepare(db) {
  await require('./test_capability_scientific_runtime')(db);
  const scope = fixture.scoped(db, 'MISSION:scientific');
  const row = await db.get('SELECT contracts_json FROM morph_experiment_waves WHERE wave_id = ?', 'scientific-wave');
  await waves.openWave(db, { ...scope, waveId: 'atomic-scientific-wave', candidates: JSON.parse(row.contracts_json), budget: 1 });
  const ledger = science.createScientificEvidenceLedger(db);
  const claim = (await ledger.inspectExperiment({ experimentId: 'scientific-exp' })).claims[0];
  return { scope, claim, ledger };
}

async function proveAtomicConsumer(db, prepared) {
  let enter;
  let resume;
  const entered = new Promise(resolve => { enter = resolve; });
  const paused = new Promise(resolve => { resume = resolve; });
  const original = db.run.bind(db);
  db.run = async (sql, ...args) => {
    if (sql.includes('INSERT OR IGNORE INTO morph_capability_artifacts') && args[0][2] === 'experiment-verification') {
      enter(); await paused;
    }
    return original(sql, ...args);
  };
  let sealing;
  let retracting;
  try {
    const input = { ...prepared.scope, waveId: 'atomic-scientific-wave', results: [{
      assessmentId: 'scientific-assessment', experimentId: 'test-scientific', outcome: 'duplicate' }] };
    sealing = bridge.sealScientificWave(db, input);
    await entered;
    let done = false;
    retracting = prepared.ledger.recordClaimTransition({ experimentId: 'scientific-exp', claimId: prepared.claim.claimId,
      eventId: 'atomic-retract', expectedHeadHash: prepared.claim.lifecycle.headHash, status: 'retracted',
      rationale: 'Retraction during wave sealing', createdBy: 'reviewer' }).then(value => { done = true; return value; });
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(done, false, 'Retraction cannot enter the consumer transaction');
    assert.equal((await prepared.ledger.inspectExperiment({ experimentId: 'scientific-exp' })).claims[0].lifecycle.status, 'proposed');
    resume();
    assert.equal((await sealing).state, 'SEALED');
    await retracting;
    assert.equal((await prepared.ledger.inspectExperiment({ experimentId: 'scientific-exp' })).claims[0].lifecycle.status, 'retracted');
    await assert.rejects(bridge.sealScientificWave(db, input), /SCIENTIFIC_CLAIM_INACTIVE/);
  } finally {
    resume();
    await Promise.allSettled([sealing, retracting]);
    db.run = original;
  }
}

async function main() {
  const db = await fixture.database();
  try { await proveAtomicConsumer(db, await prepare(db)); }
  finally { await db.close(); }
  console.log('P1 scientific consumer: retraction serialized with wave sealing and inactive replay refused.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
