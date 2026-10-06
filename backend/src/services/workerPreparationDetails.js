'use strict';

async function resolveRoute(context) {
  const { db, parent, assignment, mission } = context;
  const native = require('./agents/workerExecutorRegistry').hasNativeMethod(assignment.workerKind, assignment.methodContract?.methodId);
  if (native || mission.executor === 'caller_mcp') return {};
  const pinned = require('./trinityWorldDesign').workerRoute(assignment);
  if (pinned) return pinned;
  const routing = require('./agentModelRoutingService');
  return await routing.explicitLocalRoute(mission) || await routing.localWorkerRoute({
    db, agentId: parent.id, role: assignment.role, modelTier: assignment.modelTier || parent.model_tier,
    tenant: { organizationId: parent.organization_id, projectId: parent.project_id }
  });
}

async function ensureWorkerCapacity(parent) {
  const { getAttribute, setAttribute } = require('./ontologyAttributes');
  if (await getAttribute(parent.id, 'worker_capacity')) return;
  await setAttribute({ agentId: parent.id, key: 'worker_capacity',
    value: { role: parent.role, purpose: 'Delegate bounded mission work' },
    modality: 'accidental', provenance: 'agentFleetWorkers' });
}

function workerPlacement(assignment, parent, plan) {
  return { artifact: assignment.artifact || plan.aTeam?.artifact || plan.trinity?.artifact || null,
    pipelineStage: Math.max(0, Number(assignment.pipelineStage || 0)),
    dependsOn: Array.isArray(assignment.dependsOn) ? assignment.dependsOn : [],
    modelTier: assignment.modelTier || parent.model_tier, workspaceIsolation: parent.isolation_mode,
    workspaceId: parent.workspace_id, fleetId: parent.fleet_id, agentType: parent.agent_type,
    cognitiveRecipe: assignment.cognitiveRecipe || null };
}

function databasePlacement(details) {
  const { parent, route, assignment } = details;
  return [parent.agent_type || 'GenOS', parent.workspace_id || null, parent.fleet_id || null,
    route.selectedModel || assignment.modelTier || parent.model_tier || 'standard',
    parent.language || 'TypeScript', parent.isolation_mode || 'Branch'];
}

module.exports = { resolveRoute, ensureWorkerCapacity, workerPlacement, databasePlacement };
