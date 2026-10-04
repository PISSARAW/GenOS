'use strict';

const { runVerification, assertVerificationInput } = require('./deterministicWorkerVerifier');

function assertRedInput(methodContract) {
  if (methodContract?.version !== 1 || methodContract.methodId !== 'falsify_procedure') {
    throw Object.assign(new Error('Red worker requires the falsify_procedure method.'), {
      code: 'WORKER_RED_INPUT_INVALID'
    });
  }
  assertVerificationInput({ ...methodContract, methodId: 'verify_procedure' });
  return true;
}

function runRed(methodContract) {
  assertRedInput(methodContract);
  const verification = runVerification({ ...methodContract, methodId: 'verify_procedure' });
  const { procedure, candidateReceipt } = methodContract.parameters;
  const counterexample = verification.verdict === 'reject' ? {
    input: procedure.parameters,
    submitted: candidateReceipt.result,
    recomputed: verification.expectedReceipt.result
  } : null;
  return {
    testedClaim: `Submitted receipt matches procedure ${procedure.methodId}.`,
    verificationMethod: 'independent_deterministic_falsification',
    verdict: counterexample ? 'reject' : 'unresolved',
    reproductionSteps: [`Recompute ${procedure.methodId} using the declared parameters.`,
      'Compare the recomputed receipt and output with the submitted claim.'],
    evidence: verification.evidence,
    expectedReceipt: verification.expectedReceipt,
    candidateReceiptId: candidateReceipt.id,
    counterexample,
    counterexamples: counterexample ? [{
      claim: `Submitted receipt matches procedure ${procedure.methodId}.`,
      attack: 'Recompute the procedure and compare its output with the submitted receipt.',
      reproductionSteps: [`Run ${procedure.methodId} on the declared parameters.`],
      evidence: verification.evidence
    }] : []
  };
}

module.exports = { assertRedInput, runRed };
