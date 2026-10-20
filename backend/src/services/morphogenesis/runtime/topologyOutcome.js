'use strict';

const SCHEMA_VERSION = '1.0.0';

function withTopologyOutcome(output, identity = {}) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return output;
  const statuses = outcomeStatuses(output);
  const topologyOutcome = {
    schemaVersion: SCHEMA_VERSION,
    topologyId: identity.topology || null,
    variantId: identity.variant || null,
    ...statuses,
    promotionEligible: promotionEligible(output, statuses)
  };
  return { ...output, ...statuses, topologyOutcome };
}

function outcomeStatuses(output) {
  const actionCount = Number.isFinite(output.actionCount) ? output.actionCount : null;
  return {
    executionStatus: output.executionStatus || executionStatus(output),
    contractStatus: output.contractStatus || contractStatus(output),
    evidenceStatus: output.evidenceStatus || evidenceStatus(output),
    missionOutcome: output.missionOutcome || missionOutcome(output, actionCount)
  };
}

function executionStatus(output) {
  if (output.status === 'BLOCKED') return 'blocked';
  if (output.status === 'FAILED') return 'failed';
  return 'completed';
}

function contractStatus(output) {
  return output.workflow || output.completion ? 'assessed' : 'not_assessed';
}

function evidenceStatus(output) {
  return ({ PASS: 'verified', FAIL: 'rejected' })[output.verdict] || 'not_assessed';
}

function missionOutcome(output, actionCount) {
  if (output.status === 'BLOCKED') return 'blocked';
  if (output.status === 'FAILED') return 'failed';
  return ({ PASS: 'verified', FAIL: 'failed' })[output.verdict]
    || (actionCount === 0 || output.status === 'NO_ACTION' ? 'no_action' : 'unverified');
}

function promotionEligible(output, statuses) {
  return output.executionProof?.promotionEligible === true
    && statuses.evidenceStatus === 'verified'
    && statuses.missionOutcome === 'verified';
}

module.exports = { SCHEMA_VERSION, withTopologyOutcome };
