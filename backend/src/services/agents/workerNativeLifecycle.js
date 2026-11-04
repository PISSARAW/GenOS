'use strict';

const { cancelledStarts } = require('../agentOrchestrationState');
const { error } = require('./workerNativeEvidence');

function assertActive(context) {
  if (cancelledStarts.has(context.mission.agentId)) throw error('MISSION_CANCELLED', 'Native worker mission was cancelled.');
  if (Date.now() >= context.deadline) throw error('WORKER_DEADLINE_EXCEEDED', 'Native worker deadline exceeded.');
}

function executionContext(db, mission) {
  const maximum = mission.workerContract?.resources?.maxTimeMs ?? 300000;
  const requested = Number(mission.timeoutMs);
  const duration = Number.isFinite(requested) && requested > 0 ? Math.min(requested, maximum) : maximum;
  return { db, mission, deadline: boundedDeadline(mission, duration) };
}

function boundedDeadline(mission, duration) {
  const deadline = Date.now() + duration;
  if (mission.executionDeadlineAt == null) return deadline;
  const absolute = typeof mission.executionDeadlineAt === 'number'
    ? mission.executionDeadlineAt : Date.parse(mission.executionDeadlineAt);
  if (!Number.isFinite(absolute)) throw error('WORKER_DEADLINE_INVALID', 'Native worker deadline is invalid.');
  return Math.min(deadline, absolute);
}

module.exports = { assertActive, executionContext };
