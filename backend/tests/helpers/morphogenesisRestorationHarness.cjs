'use strict';

const evidence = require('./qualificationEvidenceBundle.cjs');
const qualification = require('../../src/services/morphogenesis/runtime/topologyMorphogenesisQualification');

const TEST_ID = 'morphogenesis-restoration-transaction';

async function runMorphogenesisRestorationHarness(input = {}) {
  const clock = input.evidenceNow || Date.now;
  const startedAtMs = clock();
  const bundle = createEvidenceBundle(input, clock);
  let receipt = null;
  let error = null;
  try {
    receipt = await qualification.executeAttestedTopologyMorphogenesis(input);
  } catch (failure) {
    error = failure;
  }
  recordOutcome(bundle, { receipt, error, startedAtMs, completedAtMs: clock() });
  bundle.artifacts.push(transactionArtifact(receipt, error));
  bundle.promotionEligible = false;
  const dossier = evidence.finalizeBundle(bundle, { now: clock });
  dossier.promotionEligible = false;
  const evidencePath = evidence.writeBundle(dossier, input.evidenceDependencies);
  return { receipt, error, dossier, evidencePath };
}

function createEvidenceBundle(input, clock) {
  const env = { ...(input.env || process.env),
    GENOS_QUALIFICATION_PRODUCER_ID: input.producerId,
    GENOS_QUALIFICATION_VERIFIER_ID: input.verifierId };
  return evidence.createBundle({
    env, now: clock, repositoryRoot: input.repositoryRoot,
    outputFile: input.evidenceFile, dependencies: input.evidenceDependencies,
    selection: { kind: 'morphogenesis-restoration', topology: input.port?.topology,
      variant: input.plan?.selectedVariant || null },
    plannedTests: [{ id: TEST_ID, topology: input.port?.topology }]
  });
}

function recordOutcome(bundle, result) {
  const failure = result.error || result.receipt?.error;
  const status = outcomeStatus(result.receipt, failure);
  evidence.recordCommand(bundle, {
    testId: TEST_ID, command: ['morphogenesis', 'transaction'],
    outcome: { status, exitCode: status === 'PASS' ? 0 : 1, signal: null,
      errorCode: failure?.code || null, errorMessage: failure?.message || null,
      stdout: JSON.stringify(result.receipt || {}), stderr: result.error?.stack || '',
      startedAt: new Date(result.startedAtMs).toISOString(),
      durationMs: Math.max(0, result.completedAtMs - result.startedAtMs) }
  });
}

function outcomeStatus(receipt, failure) {
  if (receipt?.committed === true) return 'PASS';
  return failure?.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'FAIL';
}

function transactionArtifact(receipt, error) {
  return { kind: 'morphogenesis_transaction_receipt', promotionEligible: false,
    receipt, error: error ? { code: error.code || null, message: error.message } : null };
}

module.exports = { runMorphogenesisRestorationHarness };
