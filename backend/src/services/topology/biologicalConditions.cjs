'use strict';

function handleBiologicalCondition(mode, out) {
  return (mode === 'syncytium' && !out.biologicalMode.complete)
    || (out.biologicalMode.dispatchFailures || []).length > 0;
}

function handleBiologicalMission(context) {
  return context.request.mission || context.request.project_goal || context.request.goal || context.task;
}

module.exports = { handleBiologicalCondition, handleBiologicalMission };