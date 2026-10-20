'use strict';

function handleBiologicalCondition(_mode, out) {
  const biologicalMode = out?.biologicalMode || {};
  const members = Array.isArray(biologicalMode.members) ? biologicalMode.members : [];
  const workersCompleted = members.length > 0
    && members.every((member) => member.status === 'completed');
  return biologicalMode.complete !== true || biologicalMode.status !== 'completed'
    || !workersCompleted;
}

function handleBiologicalMission(context) {
  return context.request.mission || context.request.project_goal || context.request.goal || context.task;
}

module.exports = { handleBiologicalCondition, handleBiologicalMission };
