'use strict';

const workerGarage = require('./workerGarageService');

function validateAssignments(assignments, plan = {}) {
  const maximum = workerGarage.maxActiveWorkers();
  if (!assignments.length) return;
  if (plan.nativeMissionPlan) return validateNativeStages(assignments, maximum);
  if (assignments.length > maximum) {
    throw Object.assign(new Error(`Autonomous worker fan-out exceeds the ${maximum}-worker limit.`), {
      code: 'WORKER_FANOUT_LIMIT'
    });
  }
}

function validateNativeStages(assignments, maximum) {
  const stageCounts = new Map();
  for (const assignment of assignments) {
    const stage = assignment.pipelineStage ?? 0;
    stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1);
  }
  const peak = Math.max(0, ...stageCounts.values());
  if (peak > maximum) {
    throw Object.assign(new Error(`Native worker pipeline requires ${peak} concurrent slots, above the ${maximum}-worker limit.`), {
      code: 'WORKER_FANOUT_LIMIT'
    });
  }
}

module.exports = { validateAssignments };
