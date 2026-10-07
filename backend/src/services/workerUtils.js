const { reuseAffinity, missionAffinity } = require('./workerAffinity.js');

async function findReusableWorker(db, orchestratorId, { mission, role } = {}) {
  const workers = await db.all(`SELECT id, name, role, about, current_task as currentTask, model_tier as modelTier, language, isolation_mode as isolationMode, created_at as createdAt FROM agents WHERE parent_agent_id = ? AND execution_mode = 'worker' AND status = 'idle' AND workspace_id = (SELECT workspace_id FROM agents WHERE id = ?) ORDER BY updated_at DESC, created_at DESC, id`, orchestratorId, orchestratorId);
  return workers.map((worker) => { const affinity = reuseAffinity(worker, { mission, role }); return affinity ? { ...worker, affinity } : null; }).filter(Boolean).sort((left, right) => right.affinity.score - left.affinity.score)[0] || null;
}

module.exports = { findReusableWorker, reuseAffinity, missionAffinity };