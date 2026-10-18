'use strict';

function publicAction(action) {
  return {
    schema: action.schema,
    action: action.action,
    targetAgentId: action.targetAgentId,
    parentBindings: action.parentBindings,
    expectedOutputStatus: action.expectedOutputStatus,
    evidenceObligations: action.evidenceObligations,
    reasoning: action.reasoning
  };
}

function bindSpawn(plan, action) {
  if (!Number.isInteger(action.targetSpawnIndex)) return;
  const spawn = plan.spawnAgents?.[action.targetSpawnIndex];
  if (!spawn) return;
  spawn.genomeAction = publicAction(action);
  if (action.action === 'reuse' && action.parentBindings.length === 1) {
    spawn.genomeBinding = { ...action.parentBindings[0], status: 'active' };
    spawn.genomeAdmission = 'admitted';
  } else if (action.action === 'unresolved') {
    spawn.genomeAdmission = 'blocked';
  } else {
    spawn.genomeAdmission = 'candidate_required';
  }
}

function bindGenomeActions(plan) {
  for (const action of plan.genotypeActions || []) bindSpawn(plan, action);
  const actions = plan.genotypeActions || [];
  plan.genomeAdmission = {
    status: actions.some((action) => action.action === 'unresolved') ? 'blocked'
      : actions.some((action) => action.action !== 'reuse') ? 'candidate_required' : 'planned',
    actionCount: actions.length
  };
  return plan;
}

function bindDispatchGenomeBindings(plan, assignments) {
  for (const [index, assignment] of (assignments || []).entries()) {
    const spawn = plan.spawnAgents?.[index];
    if (!spawn) continue;
    assignment.genomeAdmission = spawn.genomeAdmission || 'not_configured';
    if (!spawn.genomeBinding) continue;
    assignment.genomeBinding = { ...spawn.genomeBinding };
    const phenotype = assignment.phenotype && typeof assignment.phenotype === 'object'
      ? assignment.phenotype : { preferredName: assignment.phenotype || null };
    assignment.phenotype = { ...phenotype,
      genomeRef: spawn.genomeBinding.genomeRef };
  }
  return assignments;
}

module.exports = { bindDispatchGenomeBindings, bindGenomeActions };
