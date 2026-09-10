const dynamicOrganization = require('../dynamicOrganizationService');
const { emit } = require('../agentOrchestrationState');
const { getDatabase } = require('../../db');

async function applyOrganizationDecision(orchestratorId, organization, reason) {
  if (!orchestratorId || !dynamicOrganization.organizationProfile(organization)) return null;
  const db = await getDatabase();
  const transition = await dynamicOrganization.changeOrganization(db, {
    orchestratorId, organization, reason, changedBy: orchestratorId
  });
  if (transition.changed) {
    emit(orchestratorId, 'ORGANIZATION_CHANGED', 'REORGANIZE', `Changed organization from '${transition.previous || 'none'}' to '${transition.organization}'.`, transition, 'info');
  }
  return transition;
}

module.exports = { applyOrganizationDecision };
