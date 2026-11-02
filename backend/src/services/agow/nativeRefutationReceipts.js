'use strict';

const { digest } = require('../biologicalIntegrity');
const { validateReceipt } = require('../epistemicVerifierReceiptService');

function check(proof, subject) {
  const result = proof.saved.evaluation.assembly.results;
  if (result.length !== 1) throw new Error('agow-refutation-single-result-required');
  const claim = result[0];
  require('../epistemic/oracleProcedureSubject').assertAntigen({ id: claim.resultId,
    claim: claim.canonicalStatement, formalResult: claim, epitopes: { evidence: { digest: claim.evidence.digest } } }, subject);
  const receipts = proof.saved.evaluation.assembly.verifications;
  if (receipts.length !== 2) throw new Error('agow-refutation-two-receipts-required');
  for (const receipt of receipts) checkReceipt(receipt, { proof, subject, claim });
  distinctExecutions(receipts);
  const total = receipts.reduce((sum, receipt) => sum + receipt.executionEvidence[0].durationMs, 0);
  if (total !== proof.attestation.value.costs.runtimeMs) throw new Error('agow-refutation-cost-mismatch');
  return receipts;
}

function checkReceipt(receipt, context) {
  const verifier = require('../verifierTrustRegistry').ensureVerifier('procedure_semantic').digest;
  if (receipt.status !== 'refuted' || receipt.independent !== true || !validateReceipt(receipt, [verifier])) {
    throw new Error('agow-refutation-signed-quorum-required');
  }
  if (receipt.resultId !== context.claim.resultId || receipt.evidenceDigest !== context.claim.evidence.digest
    || !receipt.coveredObligations?.includes(context.claim.resultId)) throw new Error('agow-refutation-claim-mismatch');
  if (receipt.executionEvidence?.length !== 1) throw new Error('agow-refutation-execution-required');
  const execution = receipt.executionEvidence[0];
  checkSubject(execution.subject, context);
  checkExecution(execution);
  checkTime(receipt, context);
}

function checkSubject(actual, context) {
  const { subject, proof } = context;
  const expected = { runId: subject.content.runId, workerId: subject.content.workerId,
    bindingHash: subject.bindingHash, runBindingHash: subject.runBindingHash,
    observationHash: subject.observationHash, observedAt: subject.observedAt,
    validUntil: subject.validUntil, allocationHash: proof.allocation.hash };
  if (digest(actual) !== digest(expected)) throw new Error('agow-refutation-subject-mismatch');
}

function checkExecution(execution) {
  checkSemanticResult(execution);
  if (execution.timedOut !== false || execution.exitCode !== 0 || execution.spawnError || execution.guardFailure) {
    throw new Error('agow-refutation-process-failed');
  }
  if (!Number.isFinite(execution.durationMs) || execution.durationMs < 0) throw new Error('agow-refutation-duration-invalid');
}

function checkSemanticResult(execution) {
  if (execution.outcome !== 'refuted' || execution.postconditions?.status !== 'refuted'
    || execution.postconditions.reason !== 'subset_postconditions_checked') throw new Error('agow-refutation-semantic-result-required');
  if (!require('../epistemic/oracleSubsetChecks').STRATEGIES.has(execution.postconditions.strategy)) {
    throw new Error('agow-refutation-strategy-invalid');
  }
}

function checkTime(receipt, context) {
  const checked = Date.parse(receipt.checkedAt);
  const produced = Date.parse(context.subject.observedAt);
  const completed = Date.parse(context.proof.attestation.value.completedAt);
  if (!Number.isFinite(checked) || checked < produced - 60000 || checked > completed + 1000) {
    throw new Error('agow-refutation-receipt-time-invalid');
  }
}

function distinctExecutions(receipts) {
  const executions = receipts.map((receipt) => receipt.executionEvidence[0]);
  const fields = ['executionId', 'processId', 'cwd'];
  for (const field of fields) {
    if (executions.some((item) => !item[field]) || new Set(executions.map((item) => item[field])).size !== 2) {
      throw new Error('agow-refutation-independent-executions-required');
    }
  }
  if (new Set(executions.map((item) => item.postconditions.strategy)).size !== 2) {
    throw new Error('agow-refutation-distinct-strategies-required');
  }
}

module.exports = { check };
