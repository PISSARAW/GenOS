'use strict';

const { isDeepStrictEqual } = require('node:util');
const { runProcedure, SUPPORTED } = require('./deterministicWorkerProcedures');

function assertVerificationInput(methodContract) {
  const parameters = methodContract?.parameters;
  const procedure = parameters?.procedure;
  const receipt = parameters?.candidateReceipt;
  if (methodContract?.version !== 1 || methodContract.methodId !== 'verify_procedure'
    || procedure?.version !== 1 || !SUPPORTED.has(procedure.methodId)
    || !procedure.parameters || typeof receipt?.id !== 'string') {
    throw Object.assign(new Error('Procedure verification requires a supported procedure and candidate receipt.'), {
      code: 'WORKER_VERIFICATION_INPUT_INVALID'
    });
  }
  return true;
}

function runVerification(methodContract) {
  assertVerificationInput(methodContract);
  const { procedure, candidateReceipt } = methodContract.parameters;
  const recomputed = runProcedure(procedure);
  const accepted = candidateReceipt.id === recomputed.receipt.id
    && candidateReceipt.inputDigest === recomputed.receipt.inputDigest
    && isDeepStrictEqual(candidateReceipt.result, recomputed.receipt.result);
  return {
    testedClaim: `Procedure ${procedure.methodId} matches the submitted receipt.`,
    verificationMethod: 'independent_deterministic_recomputation',
    verdict: accepted ? 'accept' : 'reject',
    reproductionSteps: [`Recompute ${procedure.methodId} from the persisted method parameters.`,
      'Compare the output and receipt digest with the submitted candidate.'],
    evidence: [recomputed.receipt.id],
    expectedReceipt: recomputed.receipt,
    candidateReceiptId: candidateReceipt.id
  };
}

module.exports = { assertVerificationInput, runVerification };
