'use strict';

const selfModel = require('../selfModelService');
const recall = require('./orchestratorRecall');

async function applyWorkerRecall({ db, agentId, normalizedMission }) {
  const scope = await db.get(`SELECT w.organization_id AS organizationId,
    w.project_id AS projectId FROM agents a
    LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`, agentId);
  if (scope?.organizationId && scope?.projectId) {
    if ((normalizedMission.organizationId && normalizedMission.organizationId !== scope.organizationId)
      || (normalizedMission.projectId && normalizedMission.projectId !== scope.projectId)) {
      throw new Error('Worker mission tenant conflicts with persisted workspace scope.');
    }
    normalizedMission.organizationId = scope.organizationId;
    normalizedMission.projectId = scope.projectId;
  }
  const workerPlan = { selfModel: await selfModel.load(db, agentId,
    { mission: normalizedMission, plan: null }) };
  return recall.recallBeforePlanning({ db, agentId, normalizedMission, autonomyPlan: workerPlan });
}

module.exports = { applyWorkerRecall };
