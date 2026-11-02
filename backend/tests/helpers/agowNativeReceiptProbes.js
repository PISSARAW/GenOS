'use strict';

const assert = require('node:assert/strict');
const native = require('../../src/services/agow/nativeMissionOutcomeVerifier');
const { digest, encode } = require('../../src/services/biologicalIntegrity');

async function qualify(db, input) {
  const runId = input.binding.runId;
  const original = await db.get('SELECT receipt_json, payload_hash FROM biological_worker_receipts WHERE run_id=?', runId);
  const changed = JSON.parse(original.receipt_json);
  changed.result.verified = true;
  changed.semanticVerification.acceptanceHash = 'forged-acceptance';
  await assert.rejects(db.run('UPDATE biological_worker_receipts SET receipt_json=?, payload_hash=? WHERE run_id=?',
    encode(changed), digest(changed), runId), /Immutable biological record/);
  const record = await db.get(`SELECT event_key FROM biological_worker_observations
    WHERE run_id=? AND event_key=?`, runId, input.eventIdentity.eventId);
  assert.ok(record);
  await assert.rejects(db.run('UPDATE biological_worker_observations SET applied=0 WHERE run_id=? AND event_key=?',
    runId, record.event_key), /Applied observation cannot regress/);
  assert.equal((await native.verify(input)).metrics.realizedLoss, 0);
}

module.exports = { qualify };
