'use strict';

const receiptService = require('../learning/routeReceiptService');

function failedEdges(session, receipt, trustedVerifierDigests) {
  const verified = receiptService.validateReceipt(session, receipt, trustedVerifierDigests);
  if (verified.outcome !== 'FAILURE') {
    throw Object.assign(new Error('Route repair requires a verified failure receipt.'), { code: 'RHIZOME_ROUTE_FAILURE_REQUIRED' });
  }
  return verified.edgeIds;
}

module.exports = { failedEdges };
