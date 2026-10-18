'use strict';

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function summarizeReplications(rows) {
  const attempts = Array.isArray(rows) ? rows : [];
  const failures = attempts.filter(row => row.oracleVerified !== true
    || row.executionVerified !== true || row.budgetExceeded === true);
  const scores = attempts.map(row => Number(row.score)).filter(Number.isFinite);
  const totalCost = attempts.map(row => Number(row.cost)).filter(Number.isFinite)
    .reduce((sum, value) => sum + value, 0);
  return {
    attemptCount: attempts.length,
    failureCount: failures.length,
    failureRate: attempts.length ? failures.length / attempts.length : null,
    taskFamilies: unique(attempts.map(row => row.taskFamily)),
    seeds: unique(attempts.map(row => String(row.seed))),
    meanScore: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
    totalCost
  };
}

function receiptReady(receipt) {
  return receipt?.verified === true && receipt?.realExecution === true
    && Boolean(receipt?.evidenceRef) && finite(Date.parse(receipt?.observedAt));
}

function baseBlockers(input) {
  const blockers = [];
  if (input.phase !== 'validation') blockers.push('validation_phase_required');
  if (input.sourceClean !== true) blockers.push('source_tree_dirty');
  if (input.p5?.status !== 'qualified') blockers.push('phase5_not_qualified');
  if (input.p5?.universalGeneralization !== false) blockers.push('phase5_scope_not_bounded');
  return blockers;
}

function receiptBlockers(input) {
  const environments = Array.isArray(input.environments) ? input.environments : [];
  const workers = Array.isArray(input.externalWorkers) ? input.externalWorkers : [];
  const blockers = [];
  if (environments.length < 2 || environments.some(environment => !receiptReady(environment.receipt))) {
    blockers.push('external_deployment_receipts_missing');
  }
  if (workers.length < 2 || workers.some(worker => !receiptReady(worker.receipt))) {
    blockers.push('real_worker_receipts_missing');
  }
  return blockers;
}

function parityReady(parity) {
  return parity.verified === true && Number(parity.processCount) >= 2
    && Number(parity.deploymentCount) >= 2 && unique(parity.networkTopologies).length >= 2;
}

function rustReady(rust) {
  return rust.verified === true && rust.nasmVisible === true
    && rust.msvcReady === true && rust.cargoBuild === 'passed';
}

function runtimeBlockers(input) {
  const parity = input.distributedParity || {};
  const rust = input.rustToolchain || {};
  const blockers = [];
  if (!parityReady(parity)) {
    blockers.push('distributed_network_parity_missing');
  }
  if (!rustReady(rust)) blockers.push('rust_toolchain_unverified');
  return blockers;
}

function replicationBlockers(input, summary) {
  const plan = input.plan || {};
  const blockers = [];
  if (summary.attemptCount === 0) blockers.push('replications_missing');
  if (summary.seeds.length < Number(plan.requiredSeeds || 3)) blockers.push('seed_coverage_incomplete');
  if (summary.taskFamilies.length < Number(plan.requiredTaskFamilies || 2)) blockers.push('family_coverage_incomplete');
  if (summary.failureRate === null || summary.failureRate > Number(plan.maxFailureRate ?? 0.1)) {
    blockers.push('replication_failure_rate_exceeded');
  }
  return blockers;
}

function effectValid(effect, maxCostOverhead) {
  const positiveInterval = finite(effect.lower) && Number(effect.lower) > 0 && finite(effect.upper);
  const guarded = effect.guardrailsPreserved === true;
  const affordable = finite(effect.costOverhead) && Number(effect.costOverhead) <= maxCostOverhead;
  return positiveInterval && guarded && affordable;
}

function effectBlockers(input) {
  const plan = input.plan || {};
  const effects = Array.isArray(input.environmentEffects) ? input.environmentEffects : [];
  const maxCostOverhead = Number(plan.maxCostOverhead ?? 0.1);
  return !effects.length || effects.some(effect => !effectValid(effect, maxCostOverhead))
    ? ['cross_environment_effect_not_robust'] : [];
}

function validationBlockers(input, summary) {
  return [...baseBlockers(input), ...receiptBlockers(input), ...runtimeBlockers(input),
    ...replicationBlockers(input, summary), ...effectBlockers(input)];
}

function qualifyPhase6Validation(input = {}) {
  const summary = summarizeReplications(input.replications);
  const blockers = validationBlockers(input, summary);
  const environments = Array.isArray(input.environments) ? input.environments : [];
  const families = summary.taskFamilies;
  const seeds = summary.seeds;
  return {
    schema: 'genos.morphogenesis.phase6-validation/v1',
    status: blockers.length ? 'blocked' : 'eligible',
    validationKind: 'bounded-robustness-gate',
    scope: { campaignId: input.campaignId || null, environments: unique(environments.map(item => item.environmentId)),
      taskFamilies: families, seeds, modelIds: unique(input.replications?.map(row => row.modelId)) },
    summary,
    environmentEffects: Array.isArray(input.environmentEffects) ? input.environmentEffects : [],
    blockers,
    crossEnvironmentAdvantage: blockers.length === 0,
    universalGeneralization: false,
    runtimePromotionAuthorized: false,
    caveat: 'Cette porte valide une robustesse observée sur les environnements, familles et seeds fournis; elle ne prouve pas une généralisation universelle.'
  };
}

module.exports = { summarizeReplications, qualifyPhase6Validation };
