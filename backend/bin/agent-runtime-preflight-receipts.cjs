'use strict';

async function verifiedMissionPreflightTools({ db, mission, requiredTools }) {
  if (!db || !mission?.missionId || !mission?.agentId) return [];
  try {
    const stageKey = `preflight:${mission.missionId}`;
    const rows = await db.all(`SELECT DISTINCT tool_name FROM primitive_execution_journal
      WHERE orchestrator_id = ? AND agent_id = ? AND stage_key = ? AND status = 'completed'
        AND tool_name IN (${[...requiredTools].map(() => '?').join(',') || "''"})`,
    mission.agentId, mission.agentId, stageKey, ...requiredTools);
    return rows.map(row => row.tool_name).filter(tool => requiredTools.has(tool));
  } catch (_) {
    return [];
  }
}

module.exports = { verifiedMissionPreflightTools };
