'use strict';

function remaining(mission, now = Date.now()) {
  if (!mission.executionDeadlineAt) return null;
  const deadline = Date.parse(mission.executionDeadlineAt);
  return Number.isFinite(deadline) ? Math.max(0, deadline - now) : 0;
}

function expired(mission) {
  const value = remaining(mission);
  return value !== null && value < 1000;
}

async function exhaustExpired(recovery, source) {
  if (!expired(recovery.mission)) return false;
  await require('./durableRecoveryQueue').finish(recovery.durableItem, 'exhausted');
  require('../agentOrchestrationState').emit(source.parent_agent_id,
    'WORKER_RECOVERY_EXHAUSTED', 'DEADLINE', 'Recovery deadline expired.',
    { sourceWorkerId: source.id, terminal: true }, 'warning');
  return true;
}

function limit(mission) {
  const value = remaining(mission);
  if (value !== null) mission.timeoutMs = Math.min(mission.timeoutMs || value, value);
  return mission;
}

module.exports = { remaining, expired, exhaustExpired, limit };
