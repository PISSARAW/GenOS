'use strict';

function numericConstraint(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstString(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function planOf(ctx) {
  if (!ctx || typeof ctx !== 'object') return null;
  if (ctx.plan && typeof ctx.plan === 'object') return ctx.plan;
  if (Array.isArray(ctx.actions) || ctx.topologyChanges || ctx.spawnAgents || ctx.preserveAgents) {
    return ctx;
  }
  return null;
}

function hasConstraints(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return numericConstraint(obj.maxSpawn) !== null
    || numericConstraint(obj.maxRetire) !== null
    || numericConstraint(obj.minPreserve) !== null
    || numericConstraint(obj.maxBudgetImpact) !== null;
}

function constraintsOf(ctx, plan) {
  const candidates = [ctx?.constraints, ctx?.policy, ctx?.limits, ctx?.options];
  for (const candidate of candidates) {
    if (hasConstraints(candidate)) return candidate;
  }
  if (hasConstraints(ctx)) return ctx;
  return plan && plan.constraints ? plan.constraints : null;
}

function countByType(actions, type) {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((count, action) => count + (action && action.type === type ? 1 : 0), 0);
}

function countSpawn(plan) {
  return Number(plan.spawnAgents?.length || 0) + countByType(plan.actions, 'spawn');
}

function countRetire(plan) {
  return Number(plan.retireAgents?.length || 0) + countByType(plan.actions, 'retire');
}

function countPreserve(plan) {
  return Number(plan.preserveAgents?.length || 0) + countByType(plan.actions, 'preserve');
}

function budgetImpactOf(plan) {
  const values = [plan.budgetImpact, plan.expectedCost?.tokens, plan.expectedCost?.budgetImpact,
    plan.cost?.tokens, plan.cost?.budgetImpact, plan.budgetImpactTokens];
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function spawnError(plan, constraints) {
  const max = numericConstraint(constraints.maxSpawn);
  if (max !== null && countSpawn(plan) > max) return 'spawn count exceeds maxSpawn';
  return null;
}

function retireError(plan, constraints) {
  const max = numericConstraint(constraints.maxRetire);
  if (max !== null && countRetire(plan) > max) return 'retire count exceeds maxRetire';
  return null;
}

function preserveError(plan, constraints) {
  const min = numericConstraint(constraints.minPreserve);
  if (min !== null && countPreserve(plan) < min) return 'preserve count below minPreserve';
  return null;
}

function budgetError(plan, constraints) {
  const max = numericConstraint(constraints.maxBudgetImpact);
  if (max !== null && budgetImpactOf(plan) > max) return 'budget impact exceeds maxBudgetImpact';
  return null;
}

function validateParentBindings(action, index, errors) {
  if (action.action === 'unresolved') {
    errors.push(`genotypeActions[${index}] has no admissible parent genome`);
    return;
  }
  if (!Array.isArray(action.parentBindings) || action.parentBindings.length === 0) {
    errors.push(`genotypeActions[${index}] parentBindings are required`);
    return;
  }
  for (const parent of action.parentBindings) {
    if (!parent.genomeRef || !parent.contentHash) {
      errors.push(`genotypeActions[${index}] parent fingerprint is incomplete`);
    }
  }
}

function validateGenomeActions(plan, errors) {
  if (plan.genomeContext?.status !== 'ready') return;
  for (const [index, action] of (plan.genotypeActions || []).entries()) {
    if (action.schema !== 'genos.morphogenesis-genome-action/v1') {
      errors.push(`genotypeActions[${index}] schema is invalid`);
    }
    validateParentBindings(action, index, errors);
    if (!Array.isArray(action.evidenceObligations) || action.evidenceObligations.length === 0) {
      errors.push(`genotypeActions[${index}] evidence obligations are required`);
    }
  }
}

function validatePlan(ctx) {
  const plan = planOf(ctx);
  if (!plan) return { valid: false, errors: ['plan is required'] };
  const errors = [];
  if (!plan.topologyChanges || !plan.topologyChanges.length) errors.push('no topology changes');
  if (!plan.spawnAgents || !plan.spawnAgents.length) errors.push('no spawn agents planned');
  if (!plan.rollbackPlan) errors.push('no rollback plan');
  validateGenomeActions(plan, errors);
  const constraints = constraintsOf(ctx, plan);
  if (constraints) {
    const constraintErrors = [spawnError(plan, constraints), retireError(plan, constraints),
      preserveError(plan, constraints), budgetError(plan, constraints)]
      .filter(Boolean);
    errors.push(...constraintErrors);
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { validatePlan, planOf, constraintsOf };
