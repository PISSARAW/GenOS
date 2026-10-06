'use strict';

const { validateReceipt } = require('../epistemicVerifierReceiptService');
const { listVerifierDigests } = require('../verifierTrustRegistry');

function isConfirmedExecution(row) {
  const receipt = row?.receipt;
  if (!receipt || receipt.independent !== true || receipt.status !== row.status) return false;
  if (receipt.resultId !== row.resultId || receipt.evidenceDigest !== row.evidenceDigest) return false;
  return Array.isArray(receipt.executionEvidence) && receipt.executionEvidence.length > 0
    && validateReceipt(receipt, listVerifierDigests());
}

module.exports = { isConfirmedExecution };
