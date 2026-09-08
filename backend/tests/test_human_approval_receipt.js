const assert = require('node:assert/strict');
const { evaluatePromotionGate } = require('../src/services/strategyPromotionPolicyService');

const contract = { promotion: { require_human_approval: true } };
assert.equal(evaluatePromotionGate(contract, { humanApproved: true }).eligible, false);
assert.equal(evaluatePromotionGate(contract, {
  humanApprovalReceipt: {
    approved: true,
    approvalId: 'approval-1',
    approverId: 'reviewer-1',
    approvedAt: new Date().toISOString(),
    payloadHash: 'a'.repeat(64)
  }
}).eligible, true);
console.log('Human approval receipt checks passed.');