'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateVersionedContractReceipts } = require('../src/db/migrations/migrateVersionedContractReceipts');
const { recordState, recordTransition, compareStates, conditionalChoice } = require('../src/services/worldStateConditionalService');
const { loadReceipt } = require('../src/services/versionedContractPersistenceService');

async function verifyPersistedTransition(db) {
  const transition = await recordTransition(db, {
    runId: 'phase-8-run', missionClass: 'navigation', action: 'detour',
    before: { stateId: 'before', state: { obstacle: true, energy: 8 }, evidenceRefs: ['obs:before'] },
    after: { stateId: 'after', state: { obstacle: true, energy: 7 }, evidenceRefs: ['obs:after'] },
    context: { scenario: 'S1' }, observedAt: '2026-09-28T12:00:00.000Z',
  });
  const stored = await loadReceipt(db, transition.receiptId);
  assert.equal(stored.contractType, 'WorldTransition');
  assert.equal(stored.payload.delta.energy.change, -1);
  assert.deepEqual(stored.sourceRefs, ['obs:before', 'obs:after']);
}

function verifyStateAssessment() {
  const before = recordState({ stateId: 'before', state: { position: 0, energy: 5 }, evidenceRefs: ['obs:1'] });
  const after = recordState({ stateId: 'after', state: { position: 1, energy: 4 }, evidenceRefs: ['obs:2'] });
  const assessment = compareStates(before, after, { expectedDelta: { position: 1 }, knownStateKeys: ['position', 'energy'] });
  assert.equal(assessment.support, 1);
  assert.equal(assessment.delta.position.change, 1);
  assert.equal(assessment.decisionReady, true);
  assert.equal(compareStates(before, after, { outOfDistribution: true }).decisionReady, false);
  assert.equal(compareStates({ state: { position: 0 } }, after).uncertainty, 1);
  assert.equal(compareStates({ state: { position: 0 } }, after, { expectedDelta: { position: 1 } }).decisionReady, false);
  assert.equal(compareStates(before, { state: { hidden: true }, evidenceRefs: ['obs:3'] }, { knownStateKeys: ['position'] }).outOfDistribution, true);
}

function verifyStateConditionalChoices() {
  const candidates = [
    { action: 'detour', conditions: { obstacle: true }, expectedUtility: 3, uncertainty: 0.1 },
    { action: 'direct', conditions: { obstacle: false }, expectedUtility: 3, uncertainty: 0.1 },
    { action: 'stop', conditions: {}, expectedUtility: 0, uncertainty: 0 },
  ];
  const s1 = conditionalChoice({ state: { state: { obstacle: true }, evidenceRefs: ['obs:s1'] }, candidates });
  const s2 = conditionalChoice({ state: { state: { obstacle: false }, evidenceRefs: ['obs:s2'] }, candidates });
  assert.equal(s1.selected.action, 'detour');
  assert.equal(s2.selected.action, 'direct');
  assert.equal(s1.selected.action === s2.selected.action, false);
  assert.equal(conditionalChoice({ state: { obstacle: true, evidenceRefs: ['obs:ood'] }, candidates, outOfDistribution: true }).selected, null);
  assert.equal(conditionalChoice({ state: { unknown: 1 }, candidates: candidates.slice(0, 2) }).decisionReady, false);
  assert.equal(conditionalChoice({ state: { obstacle: true }, candidates }).decisionReady, false);
  assert.throws(() => conditionalChoice({ state: {}, candidates: [{ action: 'bad', expectedUtility: NaN }, candidates[1]] }), { code: 'INVALID_CANDIDATE' });
}

async function main() {
  verifyStateAssessment();
  verifyStateConditionalChoices();
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateVersionedContractReceipts(db);
    await verifyPersistedTransition(db);
  } finally {
    await db.close();
  }
  console.log('WorldState conditional model: SQLite transition receipts, evidence support, uncertainty, OOD and state-dependent choices passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
