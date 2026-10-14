const assert = require('node:assert/strict');
const { evaluatePromotionGate } = require('../src/services/strategyPromotionPolicyService');

const contract = { promotion: { require_human_approval: true } };
const digest = 'a'.repeat(64);
assert.equal(evaluatePromotionGate(contract, { humanApproved: true }).eligible, false);
assert.equal(evaluatePromotionGate(contract, {
  humanApprovalReceipt: {
    approved: true,
    approvalId: 'approval-1',
    approverId: 'reviewer-1',
    approvedAt: new Date().toISOString(),
    payloadHash: 'a'.repeat(64)
  },
  approvalDigest: digest
}).eligible, true);
assert.equal(evaluatePromotionGate(contract, {
  humanApprovalReceipt: { approved: true, approvalId: 'approval-2', approverId: 'reviewer-1',
    approvedAt: new Date().toISOString(), payloadHash: 'b'.repeat(64) }, approvalDigest: digest
}).eligible, false);
console.log('Human approval receipt checks passed.');
