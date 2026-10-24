const { emit } = require('./agentOrchestrationState');

function deferNativePlanDispatch({ autonomyPlan, normalizedMission, agentId }) {
  if (normalizedMission.nativeMissionPlanOwnsDispatch !== true) return false;
  autonomyPlan.aTeam.activated = false;
  autonomyPlan.aTeam.reason = 'The sealed native mission plan owns dispatch because no topology was explicitly requested.';
  emit(agentId, 'A_TEAM_DEFERRED', 'NATIVE_PLAN_OWNS_DISPATCH', autonomyPlan.aTeam.reason,
    autonomyPlan.aTeam, 'info');
  return true;
}

module.exports = { deferNativePlanDispatch };
