'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'local-nosology-outcome-test-key';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const store = require('../src/services/morphogenesis/morphogenesisNosologyOutcomeStore');
const calibration = require('../src/services/morphogenesis/morphogenesisNosologyCalibration');
const receipts = require('../src/services/epistemicVerifierReceiptService');
const trust = require('../src/services/verifierTrustRegistry');

function observation() {
  const row = { id: 'nosology-observation-1', caseId: 'case-1', mode: 'family_max_v1',
    taskFamily: 'incident', modelId: 'model-a', evaluationDomain: 'runtime',
    datasetDigest: `sha256:${'b'.repeat(64)}`, quality: 0.7, cost: 0.1, holdout: true };
  row.receipt = receipts.issueReceipt({ resultId: row.id,
    evidenceDigest: calibration.digest(row),
    verifierDigest: trust.getVerifier('benchmark').digest, independent: true,
    independenceDescriptor: { actorId: 'independent-oracle', workspaceId: 'oracle-workspace' } });
  return row;
}

async function main() {
  const db = openDatabase();
  const scope = { missionId: 'mission-a', organizationId: 'org-a', projectId: 'project-a' };
  try {
    const row = observation();
    assert.equal((await store.record(db, scope, row)).recorded, true);
    assert.equal((await store.record(db, scope, row)).recorded, false);
    assert.equal((await store.load(db, scope)).length, 1);
    assert.equal((await store.load(db, { ...scope, projectId: 'other' })).length, 0);
    await assert.rejects(() => store.record(db, { ...scope, missionId: 'other' }, row),
      (error) => error.code === 'NOSOLOGY_PROJECTION_OUTCOME_CONFLICT');
    await assert.rejects(() => store.record(db, scope, { ...row, receipt: null }),
      (error) => error.code === 'NOSOLOGY_PROJECTION_OUTCOME_INVALID');
    await assert.rejects(db.run(`UPDATE morphogenesis_nosology_projection_outcomes
      SET observation_json = '{}' WHERE observation_id = ?`, row.id));
  } finally { await db.close(); }
  console.log('Morphogenesis nosology outcome store: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
