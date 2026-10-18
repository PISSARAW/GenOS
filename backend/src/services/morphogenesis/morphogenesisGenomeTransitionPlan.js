'use strict';

function keyOf(action) {
  return `${action.action}:${action.targetAgentId}`;
}

function transitionAction(action) {
  return {
    type: 'genome',
    genomeAction: action,
    targetAgentId: action.targetAgentId,
    genomeActionKey: keyOf(action)
  };
}

function attachGenomeActions(ctx) {
  const plan = ctx?.plan;
  if (!plan || !Array.isArray(plan.genotypeActions) || plan.genotypeActions.length === 0) return ctx;
  const actions = Array.isArray(plan.actions) ? plan.actions : [];
  const existing = new Set(actions.filter((action) => action.type === 'genome')
    .map((action) => action.genomeActionKey || keyOf(action.genomeAction || {})));
  const genome = plan.genotypeActions
    .filter((action) => action.action !== 'unresolved' && !existing.has(keyOf(action)))
    .map(transitionAction);
  return { ...ctx, plan: { ...plan, actions: [...genome, ...actions] } };
}

function preparationErrors(plan) {
  const actions = plan.actions || [];
  const derives = actions.some((action) => action.type === 'genome'
    && action.genomeAction?.action !== 'reuse');
  return derives && actions.some((action) => action.type !== 'genome')
    ? ['derived genome preparation cannot share a transition with runtime actions'] : [];
}

module.exports = { attachGenomeActions, preparationErrors };
