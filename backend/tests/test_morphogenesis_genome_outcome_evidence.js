'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'local-genome-outcome-test-key';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const calibration = require('../src/services/morphogenesis/morphogenesisSelectorCalibration');
const evidence = require('../src/services/morphogenesis/morphogenesisGenomeOutcomeEvidence');
const paired = require('../src/services/morphogenesis/morphogenesisPairedOutcomeProducer');
const pairEvidence = require('../src/services/morphogenesis/morphogenesisPairedOutcomeEvidence');
const receipts = require('../src/services/epistemicVerifierReceiptService');
const transitions = require('../src/services/morphogenesis/morphogenesisTransitionReceipt');
const trust = require('../src/services/verifierTrustRegistry');

const scope = { missionId: 'genome-evaluation', organizationId: 'org-a', projectId: 'project-a' };
const candidateHash = 'candidate-content-hash';
const parentHash = 'parent-content-hash';

function sign(resultId, evidenceDigest, options = {}) {
  return receipts.issueReceipt({ resultId, evidenceDigest,
    verifierDigest: trust.getVerifier('benchmark').digest, independent: true,
    checkedAt: options.checkedAt,
    independenceDescriptor: { actorId: 'independent-oracle',
      workspaceId: options.workspaceId || 'oracle-workspace' } });
}

function signedAttempt(attempt) {
  attempt.oracleReceipt = sign(attempt.id, pairEvidence.sha(pairEvidence.observedAttempt(attempt)),
    { checkedAt: '2026-10-18T12:00:00.000Z' });
  return attempt;
}

function verifiedGenomeOutcome() {
  const workerId = 'candidate-worker';
  const state = { workers: new Map([[workerId, { workerKind: 'scout_cell',
    morphologyTopology: 'trinity', morphologyVariant: 'pareto',
    genomeBinding: { genomeRef: 'candidate', contentHash: candidateHash,
      phenotypeHash: 'candidate-phenotype', status: 'candidate' } }]]) };
  const adaptation = { receipt: {}, admission: { status: 'admitted',
    selectionBasis: 'isolated_genome_evaluation', recipe: {
      id: 'variant:trinity:pareto', topology: 'trinity', variant: 'pareto' } },
  plan: { morphologyPatch: { graph: { graphId: 'genome-evaluation-graph', version: 1 } } } };
  const transitionReceipt = transitions.sealTransitionReceipt({ state,
    survivors: [{ agentId: workerId }], continuation: { perWorkerTokens: 100 }, adaptation });
  transitions.finalizeTransitionQueue(transitionReceipt, [workerId]);
  const shared = { taskId: 'task-genome', seed: 17, replicationId: 'replicate-1',
    taskFamily: 'causal-analysis', modelId: 'model-a', evaluationDomain: 'genome-arena',
    startedAt: '2026-10-18T10:00:00.000Z', budgetTokens: 1000,
    latencyBudgetMs: 1000, toolPolicyHash: 'fixed-policy', completed: true };
  const candidate = signedAttempt({ ...shared, id: 'candidate-attempt',
    workspaceId: 'candidate-workspace', quality: 0.8, tokens: 500, latencyMs: 500,
    transitionId: transitionReceipt.transitionId,
    workerResults: [{ agentId: workerId, workerKind: 'scout_cell', topology: 'trinity',
      variant: 'pareto', allocatedTokens: 100, transitionId: transitionReceipt.transitionId,
      status: 'completed', genomeContentHash: candidateHash }] });
  const control = signedAttempt({ ...shared, id: 'control-attempt',
    workspaceId: 'control-workspace', quality: 0.3, tokens: 400, latencyMs: 400,
    transitionId: null,
    workerResults: [{ agentId: 'control-worker', status: 'completed',
      genomeContentHash: parentHash }] });
  const prediction = { id: 'genome-prediction', candidateId: 'variant:trinity:pareto',
    taskId: shared.taskId, seed: shared.seed, replicationId: shared.replicationId,
    split: 'validation', method: 'pre_registered_genome_pair',
    recordedAt: '2026-10-17T10:00:00.000Z', predictedGain: 0.4, predictedCost: 0.1 };
  prediction.receipt = sign(prediction.id,
    pairEvidence.sha(pairEvidence.observedPrediction(prediction)), { checkedAt: prediction.recordedAt });
  const row = paired.buildRow({ candidate, control, prediction, transitionReceipt });
  row.receipt = sign(row.id, calibration.digest(row), { checkedAt: '2026-10-18T13:00:00.000Z' });
  return row;
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const outcome = verifiedGenomeOutcome();
    await paired.recordPairedOutcome(db, { scope, pair: outcome.pairEvidence, receipt: outcome.receipt });
    const context = { row: { organization_id: scope.organizationId, project_id: scope.projectId },
      evidence: { outcomeId: outcome.id, missionId: scope.missionId,
        candidateContentHash: candidateHash, parentContentHash: parentHash },
      model: { contentHash: candidateHash }, parent: { contentHash: parentHash } };
    assert.equal(await evidence.verifyGenomeOutcomeEvidence(db, context), true);
    assert.equal(await evidence.verifyGenomeOutcomeEvidence(db, {
      ...context, evidence: { ...context.evidence, missionId: 'wrong-mission' }
    }), false);
    assert.equal(await evidence.verifyGenomeOutcomeEvidence(db, {
      ...context, parent: { contentHash: 'drifted-parent' }
    }), false);
  } finally {
    await db.close();
  }
  console.log('Morphogenesis genome outcome evidence: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
