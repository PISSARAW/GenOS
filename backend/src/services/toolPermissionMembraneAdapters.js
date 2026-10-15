'use strict';

const { normalizeToolName } = require('./toolLeasePolicy');

function platformSafetyPolicy(outcome, identity = {}) {
  const source = outcome || {};
  const mapped = source.decision === 'approval_required' ? 'ask' : source.decision;
  const decision = ['allow', 'deny', 'ask', 'evaluate'].includes(mapped) ? mapped : 'deny';
  return {
    id: identity.id || 'platform-safety', version: identity.version || 'legacy-v1', decision,
    reason: source.reason || (decision === 'deny' ? 'platform_safety_unrecognized' : null)
  };
}

function cedarAuthorityCheck(allowed, metadata = {}) {
  return {
    source: 'cedar', decision: allowed === true ? 'allow' : 'deny',
    deciderId: metadata.deciderId || 'cedar-agent-authority',
    reason: metadata.reason || (allowed === true ? 'cedar_allowed' : 'cedar_denied')
  };
}

function leaseContract(id, tools) {
  return {
    id,
    tools: Array.isArray(tools) ? tools.map(normalizeToolName).filter(Boolean) : []
  };
}

function parsePayload(row) {
  try {
    return JSON.parse(row?.payload_json || '{}');
  } catch (_) {
    return {};
  }
}

function platformApproval(row) {
  if (!row) return null;
  const payload = parsePayload(row);
  return {
    id: row.id, status: row.status, deciderId: row.decision_by,
    bindingHash: payload.membraneBindingHash,
    payloadHash: row.payload_hash
  };
}

module.exports = {
  platformSafetyPolicy,
  cedarAuthorityCheck,
  leaseContract,
  platformApproval
};
