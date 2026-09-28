'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const { RECEIPT_SCHEMA, evaluateReceipt, evaluateReceiptSet } = require('../src/services/indicatorReceiptService');

function receiptFixture() {
  const content = 'Observed behavior and trace';
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');
  const passed = { status: 'passed', evidenceRefs: ['trace-1'] };
  const later = { status: 'not_run', evidenceRefs: [] };
  return {
    schema: RECEIPT_SCHEMA,
    id: 'receipt-1',
    registryVersion: 'genos.indicator-registry/v1',
    profile: 'node-runtime',
    property: 'GWT-3',
    protocol: { id: 'workspace-delivery', version: '1' },
    stages: { specified: passed, implemented: passed, causal: later, generalized: later, operational: later },
    artifacts: [{ ref: 'trace-1', content, sha256 }],
    result: { outcome: 'observed' },
    limits: ['Essai en environnement de test'],
    provenance: { runId: 'run-1', source: 'test-harness' },
  };
}

const valid = evaluateReceipt(receiptFixture());
assert.equal(valid.property.id, 'GWT-3');
assert.equal(valid.stages.implemented.status, 'passed');
assert.equal(valid.stages.causal.status, 'not_run');
assert.equal(valid.assessment, 'receipt-consistency-only');
assert.equal(valid.promotionEligible, false);

const receiptTwo = receiptFixture();
receiptTwo.id = 'receipt-2';
receiptTwo.provenance.runId = 'run-2';
receiptTwo.stages.implemented.status = 'failed';
const set = evaluateReceiptSet([receiptFixture(), receiptTwo]);
assert.equal(set.receiptCount, 2);
assert.equal(set.properties[0].stages.implemented.status, 'failed');
assert.equal(set.properties[0].stages.causal.status, 'not_run');
assert.equal(set.promotionEligible, false);
assert.throws(() => evaluateReceiptSet([receiptFixture(), receiptFixture()]), { code: 'RECEIPT_EVIDENCE_INCOHERENT' });

const cli = spawnSync(process.execPath, [path.join(__dirname, '../bin/genos-indicators.cjs'), 'evaluate'], {
  input: JSON.stringify(receiptFixture()), encoding: 'utf8'
});
assert.equal(cli.status, 0, cli.stderr);
assert.equal(JSON.parse(cli.stdout).schema, 'genos.indicator-evaluation-set/v1');

const cliSet = spawnSync(process.execPath, [path.join(__dirname, '../bin/genos-indicators.cjs'), 'evaluate'], {
  input: JSON.stringify({ receipts: [receiptFixture(), receiptTwo] }), encoding: 'utf8'
});
assert.equal(cliSet.status, 0, cliSet.stderr);
assert.equal(JSON.parse(cliSet.stdout).receiptCount, 2);

const missing = receiptFixture();
missing.stages.specified.evidenceRefs = ['absent'];
assert.throws(() => evaluateReceipt(missing), { code: 'RECEIPT_REF_MISSING' });

const failedMissing = receiptFixture();
failedMissing.stages.causal.status = 'failed';
failedMissing.stages.causal.evidenceRefs = ['absent'];
assert.throws(() => evaluateReceipt(failedMissing), { code: 'RECEIPT_REF_MISSING' });

const incoherent = receiptFixture();
incoherent.stages.implemented.status = 'not_run';
incoherent.stages.implemented.evidenceRefs = [];
incoherent.stages.causal.status = 'passed';
incoherent.stages.causal.evidenceRefs = ['trace-1'];
assert.throws(() => evaluateReceipt(incoherent), { code: 'RECEIPT_EVIDENCE_INCOHERENT' });

const tampered = receiptFixture();
tampered.artifacts[0].content = 'tampered';
assert.throws(() => evaluateReceipt(tampered), { code: 'RECEIPT_EVIDENCE_INCOHERENT' });

const unavailable = receiptFixture();
unavailable.profile = 'composed-perceptual';
assert.throws(() => evaluateReceipt(unavailable), { code: 'RECEIPT_PROFILE_MISMATCH' });

const missingResult = receiptFixture();
delete missingResult.result;
assert.throws(() => evaluateReceipt(missingResult), { code: 'RECEIPT_EVIDENCE_INCOHERENT' });

const unknownStage = receiptFixture();
unknownStage.stages.experimental = { status: 'passed', evidenceRefs: ['trace-1'] };
assert.throws(() => evaluateReceipt(unknownStage), { code: 'RECEIPT_EVIDENCE_INCOHERENT' });

console.log('Indicator receipt service: schema, evidence, stages and profile refusals passed.');
