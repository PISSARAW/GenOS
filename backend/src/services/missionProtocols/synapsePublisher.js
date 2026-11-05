'use strict';

const { digest } = require('../evidenceProtocol/canonical');

async function nativeTrinityChild(binding, source) {
  if (binding.missionId !== `trinity_${source.agentId}_${source.runId}`) return false;
  const table = await binding.db.get("SELECT name FROM sqlite_master WHERE name='trinity_experiments'");
  if (!table) return false;
  const experiment = await binding.db.get(`SELECT e.design_json FROM trinity_experiments e
    JOIN trinity_worlds w ON w.experiment_id=e.id
    JOIN missions m ON m.mission_id=e.mission_id
    JOIN mission_agents a ON a.mission_id=m.mission_id AND a.agent_id=w.agent_id
    JOIN mission_agents p ON p.mission_id=m.mission_id AND p.agent_id=m.orchestrator_agent_id
    JOIN missions root ON root.mission_id=? AND root.orchestrator_agent_id=p.agent_id
    JOIN mission_agents rp ON rp.mission_id=root.mission_id AND rp.agent_id=p.agent_id
    WHERE e.id=? AND e.mission_id=? AND w.agent_id=? AND m.orchestrator_agent_id=?`,
  source.missionId, binding.missionId, binding.missionId, binding.agentId, source.agentId);
  return Boolean(experiment && JSON.parse(experiment.design_json).orchestratorId === source.agentId);
}

async function publisher(binding) {
  const row = await binding.db.get(`SELECT a.id AS agentId,a.workspace_id AS workspaceId,
    w.organization_id AS organizationId,w.project_id AS projectId FROM missions m
    JOIN agents child ON child.id=?
    JOIN agents a ON a.id=COALESCE(child.parent_agent_id,m.orchestrator_agent_id)
    JOIN workspaces w ON w.id=a.workspace_id WHERE m.mission_id=?`, binding.agentId, binding.missionId);
  if (!row || row.agentId === binding.agentId) return null;
  if (digest([row.organizationId, row.projectId]) !== digest([binding.scope.organizationId, binding.scope.projectId])) {
    throw new Error('Mission SYNAPSE publisher belongs to another tenant.');
  }
  const run = await binding.db.get('SELECT id FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', row.agentId);
  if (!run) throw new Error('Mission SYNAPSE publisher has no execution incarnation.');
  const held = await require('../gvxMissionProvenance').readRun(binding.db, { runId: run.id,
    scope: { ...binding.scope, entityId: row.agentId } });
  if (!held || (held.mission.id !== binding.missionId &&
    !await nativeTrinityChild(binding, { agentId: row.agentId, runId: run.id, missionId: held.mission.id }))) {
    throw new Error('Mission SYNAPSE publisher incarnation belongs to another mission.');
  }
  return { agentId: row.agentId, incarnationId: run.id, trustDomain: binding.scope.organizationId };
}

module.exports = { publisher, nativeTrinityChild };
