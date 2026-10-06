'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const ledger = require('../src/services/cognitivePersistentVisibilityLedger');
const receipts = require('../src/services/cognitiveInferenceReceiptService');
const compiler = require('../src/services/cognitiveResidualCompiler');

async function sampleContract() {
  return compiler.compileSignal({ agentId: 'agent-1', context: {}, signal: {
    signalId: 'persistent-s1', signalType: 'ligand', llmRequired: true,
    signalData: { claim: 'persistent visibility' }
  } });
}

(async () => {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await ledger.materialize(db, { sessionId: 's1', objectId: 'f1', value: { claim: 'x' }, scope: 'mission' });
  assert.equal((await ledger.visible(db, { sessionId: 's1', objectId: 'f1', scope: 'mission' })).visible, true);
  const recovered = await ledger.recover(db, 's1');
  assert.equal(recovered.fragments[0].object_id, 'f1');
  await ledger.openSession(db, { sessionId: 's1', model: 'model-a', modelVersion: '1' });
  assert.equal((await ledger.visible(db, { sessionId: 's1', objectId: 'f1' })).visible, false);
  await ledger.materialize(db, { sessionId: 's1', objectId: 'f2', value: 'fresh' });
  await ledger.compact(db, { sessionId: 's1', retainedObjectIds: [] });
  assert.equal((await ledger.visible(db, { sessionId: 's1', objectId: 'f2' })).visible, false);
  await ledger.materialize(db, { sessionId: 's1', objectId: 'expired', value: 'old',
    expiresAt: '2000-01-01T00:00:00Z' });
  assert.equal((await ledger.visible(db, { sessionId: 's1', objectId: 'expired' })).visible, false);

  const compiled = await sampleContract();
  const reservation = await receipts.reserve(db, compiled);
  const receipt = await db.get('SELECT session_id, visibility_revision FROM cognitive_inference_receipts WHERE invocation_id = ?',
    reservation.invocationId);
  assert.equal(receipt.session_id, 'agent:agent-1');
  assert.equal(typeof receipt.visibility_revision, 'number');
  await receipts.complete(db, reservation.invocationId, { text: 'candidate x' });
  assert.equal((await ledger.recover(db, 'agent:agent-1')).fragments.length, 1);
  await db.close();
  console.log('Persistent cognitive visibility checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
