'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const ledger = require('../src/services/gvxDevelopmentLedger');
const gate = require('../src/services/consciousnessEvidence/indicatorPromotionGate');
const collector = require('../src/services/consciousnessEvidence/indicatorEvidenceCollector');
const report = require('../src/services/consciousnessEvidence/indicatorReportService');
const suite = require('../src/services/agow/experiments/unifiedConsciousnessSuiteService');

async function main() {
  testGate();
  await testCollector();
  testSuiteLocks();
  console.log('Consciousness evidence gates and unified suite checks passed.');
}

function testGate() {
  const kinds = gate.REQUIREMENTS.operational;
  const receipts = kinds.map((kind, index) => ({ kind, verified: true, independentVerification: true,
    verifierId: 'trusted', evidenceClass: 'independent_requirement_verification',
    receiptHash: String(index + 1).padStart(64, '0') }));
  assert.equal(gate.evaluate({ indicatorId: 'GWT-3', receipts }).promotionAllowed, true);
  assert.equal(gate.evaluate({ indicatorId: 'GWT-3', receipts: [{ ...receipts[0], independentVerification: false }] }).eligible, false);
  assert.equal(gate.validReceipts([{ ...receipts[1], evidenceClass: 'test_result' }]).length, 0);
  assert.equal(gate.highestStage([]), 'not_assessed');
}

async function testCollector() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const scope = { organizationId: 'org', projectId: 'project', entityId: 'agent' };
  try {
    await migrateGvxLedger(db);
    await ledger.appendEvent(db, { ...scope, type: 'evidence_attached', payload: {
      kind: 'consciousness_indicator_evidence', indicatorId: 'GWT-3', requirementKind: 'implementation',
      verified: true, receiptHash: 'a'.repeat(64), evidenceClass: 'independent_requirement_verification' } });
    const collected = await collector.collect({ db, scope, indicatorId: 'GWT-3' });
    assert.equal(collected.receipts.length, 0);
    assert.equal(collected.rejectedCount, 1);
    const current = await report.report({ db, scope, indicators: ['GWT-3'] });
    assert.equal(current.reports[0].highestStage, 'not_assessed');
    assert.deepEqual(current.claimsPromoted, []);
  } finally { await db.close(); }
}

function testSuiteLocks() {
  const definitions = suite.REQUIRED_CHALLENGES.map((challenge) => ({ challenge,
    modelLock: { id: 'model' }, toolLock: { hash: 'a'.repeat(64) }, budget: { world: 10 }, seeds: ['s1', 's2'] }));
  const registry = { get: (name) => definitions.find((item) => item.challenge === name) };
  assert.equal(suite.validateSuite(registry).challenges.length, 6);
  definitions[5].toolLock.hash = 'b'.repeat(64);
  assert.throws(() => suite.validateSuite(registry), /must match/);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
