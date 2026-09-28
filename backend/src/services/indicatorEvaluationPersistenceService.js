'use strict';

const crypto = require('node:crypto');
const { createReceipt } = require('./versionedContractService');
const { persistReceipt, loadReceipt } = require('./versionedContractPersistenceService');

function evaluationPayload(report) {
  if (!report || report.promotionEligible !== false || !Number.isInteger(report.receiptCount)) {
    const error = new Error('Only a non-promoting indicator evaluation report can be persisted.');
    error.code = 'INVALID_INDICATOR_EVALUATION';
    throw error;
  }
  const reportHash = crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
  return {
    evaluationSchema: report.schema,
    receiptCount: report.receiptCount,
    propertyCount: report.properties.length,
    assessment: report.assessment,
    reportHash,
    report,
  };
}

async function persistIndicatorEvaluation(db, report) {
  const payload = evaluationPayload(report);
  const receipt = createReceipt('IndicatorEvaluation', payload, {
    runId: report.evaluations.map((entry) => entry.provenance.runId).join(','),
    sourceRefs: report.evaluations.flatMap((entry) => entry.receiptId ? [`indicator-receipt:${entry.receiptId}`] : []),
  });
  const persisted = await persistReceipt(db, receipt, { eventType: 'INDICATOR_EVALUATION_STORED' });
  return { ...persisted, receipt };
}

async function loadIndicatorEvaluation(db, receiptId) {
  const receipt = await loadReceipt(db, receiptId);
  if (!receipt) return null;
  if (receipt.contractType !== 'IndicatorEvaluation') return null;
  const expected = crypto.createHash('sha256').update(JSON.stringify(receipt.payload.report)).digest('hex');
  if (expected !== receipt.payload.reportHash) {
    const error = new Error('Persisted indicator evaluation hash mismatch.');
    error.code = 'INDICATOR_EVALUATION_HASH_MISMATCH';
    throw error;
  }
  return receipt;
}

module.exports = { persistIndicatorEvaluation, loadIndicatorEvaluation };
