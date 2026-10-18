'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runPhase4Audit, evaluateConfidenceCalibration, validatePartition } = require('./phase4Audit.cjs');

const training = [
  { taskId: 'train-1', taskFamily: 'family-a', oracleId: 'oracle-a' },
  { taskId: 'train-2', taskFamily: 'family-b', oracleId: 'oracle-b' }
];
const holdout = [
  { taskId: 'holdout-1', taskFamily: 'family-c', oracleId: 'oracle-c', selectorAccess: false,
    oracleVerified: true, outcome: true, outcomes: { trinity: 0.9, biome: 0.4 } },
  { taskId: 'holdout-2', taskFamily: 'family-d', oracleId: 'oracle-d', selectorAccess: false,
    oracleVerified: true, outcome: false, outcomes: { trinity: 0.2, biome: 0.7 } },
  { taskId: 'holdout-3', taskFamily: 'family-e', oracleId: 'oracle-e', selectorAccess: false,
    oracleVerified: true, outcome: true, outcomes: { trinity: 0.8, biome: 0.6 } }
];

function predictions() {
  return holdout.map((row, index) => ({ taskId: row.taskId, sourceSplit: 'training', topology: index === 1 ? 'biome' : 'trinity',
    confidence: index === 1 ? 0.2 : 0.8 }));
}

function baselines() {
  return {
    fixedTrinity: holdout.map(row => ({ taskId: row.taskId, topology: 'trinity' })),
    fixedBiome: holdout.map(row => ({ taskId: row.taskId, topology: 'biome' }))
  };
}

function run() {
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'ateam-paraphrase-cases.json'), 'utf8')).pairs;
  const report = runPhase4Audit({ training, holdout, predictions: predictions(), baselines: baselines(), ateamCases: cases });
  assert.equal(report.schema, 'genos.morphogenesis.phase4-audit/v1');
  assert.equal(report.status, 'observed');
  assert.equal(report.calibration.coverage, 1);
  assert.equal(report.selection.holdoutTaskCount, 3);
  assert.equal(report.ateam.caseCount, 3);
  assert.equal(report.universalSuperiority, false);
  assert.equal(report.confirmationEligible, false);

  assert.throws(() => validatePartition(training, [{ ...holdout[0], taskFamily: 'family-a' }]), /taskFamily.*leakage/);
  assert.throws(() => evaluateConfidenceCalibration({ training, holdout, predictions: predictions().map(row => ({ ...row, sourceSplit: 'holdout' })) }), /invalid source split/);
  assert.throws(() => runPhase4Audit({ training, holdout, predictions: predictions().map(row => ({ ...row, oracleTopology: 'trinity' })), baselines: baselines(), ateamCases: cases }), /oracle topology/);
  console.log('Phase 4 composition, calibration and leakage gates: PASS');
}

run();
