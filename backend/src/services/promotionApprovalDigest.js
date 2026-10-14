'use strict';

const crypto = require('node:crypto');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function promotionApprovalDigest(promotion) {
  const steps = (promotion.steps || []).map(step => ({
    sequence: step.sequence,
    primitive: step.primitive,
    status: step.status,
    evidence_json: step.evidence_json,
    result_json: step.result_json,
  }));
  const payload = {
    runId: promotion.runId,
    agentId: promotion.agentId,
    contractId: promotion.contractId,
    workspaceId: promotion.workspaceId,
    contract: promotion.contract,
    task: promotion.task,
    report: promotion.report,
    budget: promotion.budget,
    rejectedBranches: promotion.rejectedBranches || [],
    steps,
  };
  return crypto.createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex');
}

module.exports = { promotionApprovalDigest };
