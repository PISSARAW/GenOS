'use strict';

function handleBiologicalCondition(mode, out) {
  const biologicalMode = out?.biologicalMode || {};
  if ((biologicalMode.dispatchFailures || []).length > 0) return true;
  const source = mode === 'rhizome' && Array.isArray(biologicalMode.branches)
    ? biologicalMode.branches : biologicalMode.members;
  const members = Array.isArray(source) ? source : [];
  const workersCompleted = members.length > 0
    && members.every((member) => member.status === 'completed');
  return biologicalMode.complete !== true || biologicalMode.status !== 'completed'
    || !workersCompleted;
}

function handleBiologicalMission(context) {
  return context.request.mission || context.request.project_goal || context.request.goal || context.task;
}

module.exports = { handleBiologicalCondition, handleBiologicalMission };
