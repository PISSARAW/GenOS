'use strict';

const { createHash } = require('node:crypto');
const { objectValue, listValue } = require('../contracts/validation');
const verifierReceipts = require('../../epistemicVerifierReceiptService');

function proofDigest(bridge, proof) {
  const fields = [bridge.bridgeId, bridge.type, bridge.fromNodeId, bridge.toNodeId, bridge.sourceCapability,
    bridge.targetCapability, bridge.inputContract, bridge.outputContract, bridge.invariants.join('/')];
  const checks = ['inputAccepted', 'outputValid', 'invariantsPreserved', 'evidencePreserved'].map((key) => proof[key] === true);
  fields.push(...checks.map(String), listValue(proof.evidenceRefs, 'evidenceRefs').join('/'));
  return `sha256:${createHash('sha256').update(fields.join('\u0000')).digest('hex')}`;
}

function validate(input) {
  const proof = objectValue(input.proof, 'BridgeValidationProof');
  const receipt = objectValue(proof.signedReceipt, 'signedReceipt');
  const evidenceRefs = listValue(proof.evidenceRefs, 'evidenceRefs');
  const checks = ['inputAccepted', 'outputValid', 'invariantsPreserved', 'evidencePreserved'];
  if (checks.some((key) => proof[key] !== true) || !evidenceRefs.length) return false;
  const expectedDigest = proofDigest(input.bridge, proof);
  return receipt.resultId === input.bridge.bridgeId && receipt.evidenceDigest === expectedDigest
    && verifierReceipts.validateReceipt(receipt, input.trustedVerifierDigests || []);
}

module.exports = { validate, proofDigest };
