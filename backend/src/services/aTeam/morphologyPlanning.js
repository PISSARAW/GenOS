'use strict';

function plan(request) {
  if (request.morphogenesis !== true) return null;
  const planner = require('../morphogenesis/morphogenesisPlannerService');
  const result = planner.planMorphogenesis({ problem: request.mission || request.goal,
    proposedTopology: 'a_team', topologyProfile: { baseTopology: 'a_team' },
    budget: request.execution_budget || request.executionBudget || {},
    currentState: { capabilities: [] }, reason: 'explicit_a_team_mission' });
  const validation = planner.validatePlan({ plan: result, budget: request.execution_budget || request.executionBudget });
  if (!validation.valid || result.selectedTopology !== 'a_team') {
    throw Object.assign(new Error('Morphogenesis did not admit the requested A-Team plan.'), {
      code: 'ATEAM_MORPHOGENESIS_INVALID', validation });
  }
  return { ...result, application: 'single_topology_dispatch',
    compositeExecution: false, adaptiveRestructuring: false };
}

module.exports = { plan };
