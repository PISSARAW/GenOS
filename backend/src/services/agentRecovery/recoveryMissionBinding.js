'use strict';

async function bindRecoveryMission(db, source, target) {
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

module.exports = { bindRecoveryMission };
