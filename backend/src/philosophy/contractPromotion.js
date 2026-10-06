'use strict';

const { verifyScenarioReceipt } = require('./contractExperiments');

const REQUIRED = Object.freeze({
  observable: ['scenario-receipt'], tested: ['scenario-receipt'],
  integrated: ['scenario-receipt', 'runtime-receipt'],
  validated: ['scenario-receipt', 'runtime-receipt', 'independent-receipt'],
});

function verifiedKinds(contract, evidence) {
  if (!Array.isArray(evidence) || evidence.length > 16) return [];
  if (Buffer.byteLength(JSON.stringify(evidence)) > 2 * 1024 * 1024) return [];
  // Runtime and independent receipts cannot be supplied as self-attestations.
  // Their issuer/binding path is deliberately unsupported until verified.
  return evidence.filter((item) => verifyScenarioReceipt(item, contract)).map((item) => item.kind);
}

function promotionEvidence(contract, target, evidence) {
  const verified = verifiedKinds(contract, evidence);
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
