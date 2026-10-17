'use strict';

function selected(decision) {
  return decision.policy.decision.interventionScale === 'ROSTER_REDUCTION';
}

function plan(decision, rosterPlan) {
  const recipe = decision.policy.decision.recipe;
  const rosterIntervention = { candidateId: recipe.candidateId,
    scale: 'ROSTER_REDUCTION', status: 'selected' };
  const receipt = { status: 'ADAPTED', interventionScale: 'ROSTER_REDUCTION',
    candidateId: recipe.candidateId, rosterIntervention };
  return { adapted: true, assignments: {}, rosterIntervention, rosterPlan,
    receipt, decision, reason: 'calibrated_roster_reduction' };
}

module.exports = { selected, plan };
