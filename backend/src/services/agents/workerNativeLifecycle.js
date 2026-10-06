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
  return { db, mission, deadline: Date.now() + duration };
}

module.exports = { assertActive, executionContext };
