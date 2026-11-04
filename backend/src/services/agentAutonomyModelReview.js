'use strict';

const { consultLocalModels } = require('./agentModelRoutingService');
const { emit } = require('./agentOrchestrationState');

async function applyLocalModelReview({ db, agentId, normalizedMission, autonomyPlan }) {
  if (normalizedMission.observationRequiredBeforePlanning === true) {
    autonomyPlan.localModelReview = { consulted: false, reason: 'Planning waits for a verified observation.' };
    return;
  }
  const provider = String(normalizedMission.provider || '').toLowerCase();
  if (normalizedMission.executor === 'caller_mcp' || provider.includes('codex') || provider.includes('mcp')) {
    autonomyPlan.localModelReview = { consulted: false, reason: 'Cognition is owned by the MCP caller.' };
    return;
  }
  const modelTenant = normalizedMission.workspaceId
    ? await db.get('SELECT organization_id AS organizationId, project_id AS projectId FROM workspaces WHERE id = ?', normalizedMission.workspaceId)
    : null;
  autonomyPlan.localModelReview = await consultLocalModels({ db, agentId, mission: normalizedMission, plan: autonomyPlan, tenant: modelTenant || {} });
  const consulted = autonomyPlan.localModelReview.consulted;
  const message = consulted
    ? `Local model ${autonomyPlan.localModelReview.selectedModel} reviewed the orchestration plan.`
    : 'No local model review was available; continuing with the frontier orchestrator.';
  emit(agentId, 'LOCAL_MODEL_ROUTING', 'PLAN_REVIEW', message, autonomyPlan.localModelReview, consulted ? 'info' : 'warning');
}

module.exports = { applyLocalModelReview };
