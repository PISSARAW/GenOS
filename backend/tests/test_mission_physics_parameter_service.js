'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateVersionedContractReceipts } = require('../src/db/migrations/migrateVersionedContractReceipts');
const { ensureOutboxTables } = require('../src/storage/projection/projectionOutbox');
const { proposeParameter, activateParameter, rollbackParameter, resolveActiveParameter } = require('../src/services/missionPhysicsParameterService');
const adaptive = require('../src/services/adaptiveParameterService');
const { createReceipt } = require('../src/services/versionedContractService');
const { persistReceipt } = require('../src/services/versionedContractPersistenceService');

const samples = ({ start, count, prefix, refs = [] }) => Array.from({ length: count }, (_, index) => ({ value: start + index * 0.01, sourceRef: refs[index] || `${prefix}-${index}` }));

async function storeSourceReceipts(db) {
  const refs = [];
  for (let index = 0; index < 5; index += 1) {
    const receipt = createReceipt('WorldTransition', {
      stateBefore: {}, action: 'observe', delta: {}, stateAfter: {}, context: { missionClass: 'software-fix' },
      evidenceRefs: [], observedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    }, { sourceRefs: [`measurement:sample-${index}`] });
    await persistReceipt(db, receipt);
    refs.push(receipt.receiptId);
  }
  return refs;
}

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateVersionedContractReceipts(db);
    await ensureOutboxTables(db);
    const sourceRefs = await storeSourceReceipts(db);
    const proposal = await proposeParameter(db, {
      missionClass: 'software-fix', parameterId: 'route.alpha', unit: 'ratio', runId: 'training-run',
      trainingSamples: samples({ start: 0.6, count: 3, prefix: 'train', refs: sourceRefs.slice(0, 3) }),
      validationSamples: samples({ start: 0.61, count: 2, prefix: 'holdout', refs: sourceRefs.slice(3) }),
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
      trainingSamples: samples({ start: 0.65, count: 3, prefix: 'train-2', refs: sourceRefs.slice(0, 3) }),
      validationSamples: samples({ start: 0.66, count: 2, prefix: 'holdout-2', refs: sourceRefs.slice(3) }),
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
      missionClass: 'software-fix', parameterId: 'bad', unit: 'ratio',
      trainingSamples: samples({ start: 0.2, count: 3, prefix: 'bad', refs: sourceRefs.slice(0, 3) }),
      validationSamples: samples({ start: 0.9, count: 2, prefix: 'bad-hold', refs: sourceRefs.slice(3) }),
      bounds: { min: 0, max: 1 }, maxValidationDrift: 0.01,
    }), { code: 'PHYSICS_VALIDATION_FAILED' });
    await assert.rejects(() => proposeParameter(db, {
      missionClass: 'software-fix', parameterId: 'missing-evidence', unit: 'ratio',
      trainingSamples: samples({ start: 0.6, count: 3, prefix: 'train', refs: [...sourceRefs.slice(0, 2), 'missing-receipt'] }),
      validationSamples: samples({ start: 0.61, count: 2, prefix: 'holdout', refs: sourceRefs.slice(3) }),
      bounds: { min: 0.4, max: 0.8 }, maxValidationDrift: 0.1,
    }), { code: 'PHYSICS_INSUFFICIENT_DATA' });
  } finally {
    await db.close();
  }
  console.log('Mission parameter learning: holdout, bounds, versioned SQLite receipt, explicit activation and rollback passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
