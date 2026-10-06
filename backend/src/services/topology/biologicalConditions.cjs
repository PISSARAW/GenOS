'use strict';

function handleBiologicalCondition(mode, out) {
  return (mode === 'syncytium' && !out.biologicalMode.complete)
    || (process.env.GENOS_TOPOLOGY_AWAIT_WORKERS === '1' && (out.biologicalMode.dispatchFailures || []).length);
}

function handleBiologicalMission(context) {
  return context.request.mission || context.request.project_goal || context.request.goal || context.task;
}

module.exports = { handleBiologicalCondition, handleBiologicalMission };