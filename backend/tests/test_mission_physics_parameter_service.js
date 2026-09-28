'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateVersionedContractReceipts } = require('../src/db/migrations/migrateVersionedContractReceipts');
const { ensureOutboxTables } = require('../src/storage/projection/projectionOutbox');
const { proposeParameter, activateParameter, rollbackParameter, resolveActiveParameter } = require('../src/services/missionPhysicsParameterService');
const adaptive = require('../src/services/adaptiveParameterService');

const samples = (start, count, prefix) => Array.from({ length: count }, (_, index) => ({ value: start + index * 0.01, sourceRef: `${prefix}-${index}` }));

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateVersionedContractReceipts(db);
    await ensureOutboxTables(db);
    const proposal = await proposeParameter(db, {
      missionClass: 'software-fix', parameterId: 'route.alpha', unit: 'ratio', runId: 'training-run',
      trainingSamples: samples(0.6, 3, 'train'), validationSamples: samples(0.61, 2, 'holdout'),
      bounds: { min: 0.4, max: 0.8 }, maxValidationDrift: 0.1,
    });
    assert.equal(proposal.receipt.payload.state, 'candidate');
    assert.equal(await resolveActiveParameter(db, 'software-fix', 'route.alpha'), null);
    const active = await activateParameter(db, proposal.receiptId);
    assert.equal((await resolveActiveParameter(db, 'software-fix', 'route.alpha')).receiptId, active.receiptId);
    await adaptive.loadFromDatabase(db, 'software-fix');
    assert.ok(adaptive.currentValue('route.alpha', 'software-fix') !== null);
    const proposalTwo = await proposeParameter(db, {
      missionClass: 'software-fix', parameterId: 'route.alpha', unit: 'ratio', runId: 'training-run-2',
      trainingSamples: samples(0.65, 3, 'train-2'), validationSamples: samples(0.66, 2, 'holdout-2'),
      bounds: { min: 0.4, max: 0.8 }, maxValidationDrift: 0.1,
    });
    const activeTwo = await activateParameter(db, proposalTwo.receiptId);
    await assert.rejects(() => rollbackParameter(db, active.receiptId), { code: 'PHYSICS_VALIDATION_FAILED' });
    assert.equal((await resolveActiveParameter(db, 'software-fix', 'route.alpha')).receiptId, activeTwo.receiptId);
    await rollbackParameter(db, activeTwo.receiptId);
    assert.equal((await resolveActiveParameter(db, 'software-fix', 'route.alpha')).receiptId, active.receiptId);
    await rollbackParameter(db, active.receiptId);
    assert.equal(await resolveActiveParameter(db, 'software-fix', 'route.alpha'), null);
    await assert.rejects(() => proposeParameter(db, {
      missionClass: 'software-fix', parameterId: 'bad', unit: 'ratio', trainingSamples: samples(0.2, 3, 'bad'),
      validationSamples: samples(0.9, 2, 'bad-hold'), bounds: { min: 0, max: 1 }, maxValidationDrift: 0.01,
    }), { code: 'PHYSICS_VALIDATION_FAILED' });
  } finally {
    await db.close();
  }
  console.log('Mission parameter learning: holdout, bounds, versioned SQLite receipt, explicit activation and rollback passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
