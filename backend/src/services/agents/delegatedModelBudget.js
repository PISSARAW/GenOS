'use strict';

async function scopeOwner(db, mission, scope) {
  const immediate = mission.orchestratorAgentId || mission.agentId;
  const saved = await db.get('SELECT parent_agent_id FROM mission_model_budget_scopes WHERE scope_id = ?', scope.id);
  if (!saved || saved.parent_agent_id === immediate) return immediate;
  const bounded = require('./boundedDelegationAuthority');
  const authorized = await bounded.parent(db, immediate);
  if (authorized.root.id !== saved.parent_agent_id || authorized.missionId !== mission.missionId) {
    throw Object.assign(new Error('Delegated budget belongs to another root or mission.'), { code: 'MISSION_MODEL_BUDGET_SCOPE_INVALID' });
  }
  const child = await db.get('SELECT * FROM agents WHERE id = ?', mission.agentId);
  await bounded.authorize(db, { parent: authorized.agent, agent: child });
  return saved.parent_agent_id;
}

module.exports = { scopeOwner };
