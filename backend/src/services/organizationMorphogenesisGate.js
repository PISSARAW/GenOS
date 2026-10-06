'use strict';
async function applySignalOrganizationChange(db, input) {
  const { orchestratorId, proposal, state, signalType } = input;
  const changed = Boolean(proposal && proposal.organization !== state.organization);
  if (!changed) return false;
  const governance = require('./governancePlaneService');
  const context = governance.defineContext({ principal: orchestratorId, organization: state.organization, actionRisk: 'MEDIUM', reversibility: 'reversible', action: { name: 'change_organization', risk: 'MEDIUM', impact: 'medium', reversibility: 'reversible', blastRadius: 'collective' } });
  const verdict = governance.gateMorphogenesis({ plan: { topologyChanges: 1, spawn: 0 }, context });
  if (verdict.verdict === 'HUMAN_REVIEW' || verdict.verdict === 'DENY') {
    throw new Error(`Governance denied organization change to ${proposal.organization}: ${verdict.reason || verdict.verdict}`);
  }
  await require('./dynamicOrganizationService').changeOrganization(db, {
    orchestratorId, organization: proposal.organization,
    reason: `Signal ${signalType} selected organization ${proposal.organization} (governance: ${verdict.verdict}).`,
    changedBy: orchestratorId
  });
  return true;
}
module.exports = { applySignalOrganizationChange };