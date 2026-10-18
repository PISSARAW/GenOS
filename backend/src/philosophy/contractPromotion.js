'use strict';

const { verifyScenarioReceipt } = require('./contractExperiments');
const { verifyRuntimeEvidence, verifyIndependentAttestation } = require('./independentAttestation');

const REQUIRED = Object.freeze({
  observable: ['scenario-receipt'], tested: ['scenario-receipt'],
  integrated: ['scenario-receipt', 'runtime-receipt'],
  validated: ['scenario-receipt', 'runtime-receipt', 'independent-receipt'],
});

function verifiedKinds(contract, evidence, contracts) {
  if (!Array.isArray(evidence) || evidence.length > 16) return [];
  if (Buffer.byteLength(JSON.stringify(evidence)) > 2 * 1024 * 1024) return [];
  const context = { evidence, contracts };
  return evidence.filter((item) => verifyScenarioReceipt(item, contract)
    || verifyRuntimeEvidence(item, contract, contracts)
    || verifyIndependentAttestation(item, contract, context)).map((item) => item.kind);
}

function promotionEvidence(contract, target, input) {
  const context = Array.isArray(input) ? { evidence: input, contracts: [] } : (input || {});
  const verified = verifiedKinds(contract, context.evidence, context.contracts);
  const required = REQUIRED[target] || [];
  return {
    verifiedEvidence: verified,
    missingEvidence: required.filter((kind) => !verified.includes(kind)),
    scope: 'bounded-software-audit',
    externalFactsVerified: false,
    limitation: 'Un reçu rejoué prouve le test du logiciel borné, pas son utilité ni les faits d’une mission réelle.',
  };
}

module.exports = { promotionEvidence };
