'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateScientificEvidenceLedger } = require('../src/db/migrations/migrateScientificEvidenceLedger');
const { createScientificEvidenceLedger } = require('../src/services/scientificEvidenceLedger');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA foreign_keys = ON');
    await migrateScientificEvidenceLedger(db);
    await migrateScientificEvidenceLedger(db);
    const ledger = createScientificEvidenceLedger(db);
    await assert.rejects(() => ledger.createExperiment({ title: 'ephemeral', proofLevel: 'L0', createdBy: 'test' }), { code: 'SCIENTIFIC_EPHEMERAL_NOT_PERSISTED' });
    const experiment = await ledger.createExperiment({
      experimentId: 'exp-1', title: 'Benchmark treatment', proofLevel: 'L3', createdBy: 'researcher',
      protocol: { steps: ['run', 'compare'] }, environment: { platform: 'test' }, topologyRefs: ['trinity', 'biocenose', 'biome']
    });
    assert.equal(experiment.proofLevel, 'L3');
    const claim = await ledger.recordClaim({
      experimentId: experiment.experimentId, claimId: 'claim-1',
      statement: 'Treatment improves the success rate.', scope: { benchmark: 'B1' },
      assumptions: ['same workload'], createdBy: 'analyst'
    });
    const support = await ledger.recordEvidence({
      experimentId: experiment.experimentId, claimId: claim.claimId, evidenceId: 'evidence-1',
      relation: 'SUPPORTS', sourceKind: 'observation', sourceId: 'run-a',
      evidence: { rate: 0.91, sampleSize: 100 }, environmentHash: 'a'.repeat(64),
      replicationKind: 'repeatability', topology: 'trinity', createdBy: 'runner'
    });
    const contradict = await ledger.recordEvidence({
      experimentId: experiment.experimentId, claimId: claim.claimId, evidenceId: 'evidence-2',
      relation: 'CONTRADICTS', sourceKind: 'observation', sourceId: 'run-b',
      evidence: { rate: 0.72, sampleSize: 100 }, environmentHash: 'b'.repeat(64),
      replicationKind: 'robustness', topology: 'biome', createdBy: 'runner'
    });
    assert.notEqual(support.contentHash, contradict.contentHash);
    await assert.rejects(() => ledger.recordAssessment({
      claimId: claim.claimId, kind: 'consensus', position: 'support', verifierStatus: 'verified',
      rationale: 'majority supports', createdBy: 'jury'
    }), { code: 'SCIENTIFIC_CONSENSUS_CANNOT_VERIFY' });
    await ledger.recordAssessment({
      assessmentId: 'assessment-consensus', claimId: claim.claimId, kind: 'consensus',
      position: 'support', rationale: 'Two members support; one dissents.',
      evidenceRefs: [support.evidenceId], createdBy: 'jury'
    });
    await ledger.recordAssessment({
      assessmentId: 'assessment-verifier', claimId: claim.claimId, kind: 'verifier',
      position: 'abstain', verifierStatus: 'inconclusive', rationale: 'No deterministic verifier applies.',
      evidenceRefs: [support.evidenceId, contradict.evidenceId], createdBy: 'verifier'
    });
    const result = await ledger.inspectExperiment({ experimentId: experiment.experimentId });
    assert.equal(result.claims[0].status.position, 'SUPPORTED_WITH_DISSENT');
    assert.equal(result.claims[0].status.verifierStatus, 'unverified');
    assert.equal(result.claims[0].status.promotionEligible, false);
    assert.equal(result.claims[0].evidence.length, 2);
    assert.equal(result.claims[0].assessments.length, 2);
    await assert.rejects(() => db.run('UPDATE scientific_evidence SET relation = ? WHERE evidence_id = ?', 'SUPPORTS', support.evidenceId), /immutable/);
    await assert.rejects(() => db.run('DELETE FROM scientific_assessments WHERE assessment_id = ?', 'assessment-consensus'), /immutable/);
  } finally {
    await db.close();
  }
}

run().then(() => process.stdout.write('Scientific evidence ledger invariants: PASS\n')).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
