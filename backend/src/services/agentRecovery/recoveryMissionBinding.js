'use strict';

async function bindRecoveryMission(db, source, target) {
  await inheritWorkerContract(db, source, target);
  const missionId = target.mission.missionId;
  if (typeof missionId === 'string' && missionId.trim()) {
    await require('../missionIdentityService').attachAgent(db, {
      missionId, agentId: target.targetId, role: target.role
    });
    return;
  }
  await db.run(`INSERT OR IGNORE INTO mission_agents (mission_id, agent_id, role)
    SELECT ma.mission_id, ?, ? FROM mission_agents ma JOIN missions m ON m.mission_id = ma.mission_id
    WHERE ma.agent_id = ? AND m.status IN ('active', 'dormant')`,
  target.targetId, target.role, source.id);
}

async function inheritWorkerContract(db, source, target) {
  const row = await db.get('SELECT metadata_json FROM agents WHERE id=?', source.id);
  const metadata = JSON.parse(row?.metadata_json || '{}');
  const contract = metadata.workerContract;
  if (!contract) return;
  if (contract.identity?.parentId !== target.orchestratorId) {
    throw Object.assign(new Error('Recovery contract belongs to another parent.'), { code: 'RECOVERY_CONTRACT_PARENT_MISMATCH' });
  }
  require('../agents/workerContractEnforcement').assertRuntimeContract(contract, contract.identity.workerKind);
  const changed = await db.run(`UPDATE agents SET metadata_json=json_set(COALESCE(metadata_json,'{}'),
    '$.workerKind',?,'$.workerContract',json(?)) WHERE id=? AND parent_agent_id=?`,
  contract.identity.workerKind, JSON.stringify(contract), target.targetId, target.orchestratorId);
  if (changed.changes !== 1) throw Object.assign(new Error('Recovery target changed before contract binding.'), {
    code: 'RECOVERY_CONTRACT_TARGET_MISMATCH' });
}

function resolveRecoveryRole(input) {
  const assignment = input.mission.workerAssignment || {};
  const topologyRole = assignment.topologyRole || input.mission.topologyRole;
  if (typeof topologyRole === 'string' && topologyRole.trim()) return topologyRole;
  return input.decision.role || input.source.role || input.mission.role || 'recovery_specialist';
}

module.exports = { bindRecoveryMission, inheritWorkerContract, resolveRecoveryRole };
