'use strict';

const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function createReceipt({ output, nodeId, item, permissions }) {
  const receipt = {
    receiptId: output.receipt.id,
    nodeId,
    methodId: output.receipt.methodId,
    result: output.receipt.result,
    inputHash: digest(item),
    outputHash: digest(output.output),
    permissions: [...permissions],
  };
  return { ...receipt, provenanceHash: digest(receipt) };
}

function assertProvenancePreserved(receipts) {
  if (!Array.isArray(receipts) || receipts.length === 0) return false;
  return receipts.every((receipt) => {
    if (!receipt?.receiptId || !receipt.nodeId || !receipt.methodId || !receipt.inputHash || !receipt.outputHash) return false;
    const { provenanceHash, ...payload } = receipt;
    return provenanceHash === digest(payload);
  });
}

function assertNoPermissionEscalation(authority, boundary) {
  if (!Array.isArray(authority) || !Array.isArray(boundary) || authority.includes('*')) return false;
  return authority.every((permission) => boundary.includes(permission));
}

function detectStateConflict(stateA, stateB) {
  const left = stateA ?? {};
  const right = stateB ?? {};
  for (const key of Object.keys(left)) {
    if (Object.prototype.hasOwnProperty.call(right, key) && !isDeepStrictEqual(left[key], right[key])) {
      return { conflict: true, key, leftValue: left[key], rightValue: right[key] };
    }
  }
  return { conflict: false };
}

function containsAllReceipts(expected, actual) {
  return expected.every((receipt) => actual.some((candidate) => (
    candidate.receiptId === receipt.receiptId && candidate.provenanceHash === receipt.provenanceHash
  )));
}

function sameCorpus({ expected, actual }) {
  const expectedItems = expected.map((item) => JSON.stringify(item)).sort();
  const actualItems = actual.map((item) => JSON.stringify(item)).sort();
  return expectedItems.length === actualItems.length
    && expectedItems.every((item, index) => item === actualItems[index]);
}

module.exports = { createReceipt, assertProvenancePreserved, assertNoPermissionEscalation,
  detectStateConflict, containsAllReceipts, sameCorpus };
