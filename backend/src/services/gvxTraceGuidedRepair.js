'use strict';

const attributionService = require('./gvxTraceLocusAttribution');
const mutationPlanner = require('./gvxAffinityMutationPlanner');
const nursery = require('./gvxExperimentalNursery');
const ledger = require('./gvxDevelopmentLedger');
const { hash, error } = require('./gvxContracts');

function validateDatasets(datasets) {
  const training = datasets?.trainingRefs;
  const holdout = datasets?.holdoutRefs;
  if (!boundedRefs(training) || !boundedRefs(holdout)) throw error('GVX_REPAIR_DATASETS_REQUIRED');
  if (training.some((ref) => holdout.includes(ref))) throw error('GVX_REPAIR_HOLDOUT_OVERLAP');
  return { trainingCount: training.length, holdoutCount: holdout.length,
    holdoutDigest: hash([...holdout].sort()), holdoutRefs: [...holdout] };
}

function boundedRefs(refs) {
  return Array.isArray(refs) && refs.length > 0 && refs.length <= 128
    && refs.every((ref) => typeof ref === 'string' && ref.length > 0 && ref.length <= 500)
    && new Set(refs).size === refs.length;
}

function validatePolicy(policy) {
  const objective = policy?.objective;
  if (objectiveInvalid(objective)) throw error('GVX_REPAIR_OBJECTIVE_INVALID');
  const regressions = policy.regressions || [];
  if (regressionPolicyInvalid(regressions)) throw error('GVX_REPAIR_REGRESSION_POLICY_INVALID');
  return { objective, regressions };
}

function objectiveInvalid(objective) {
  return !objective?.metric || !['maximize', 'minimize'].includes(objective.direction)
    || !Number.isFinite(objective.minimumDelta) || objective.minimumDelta < 0;
}

function regressionPolicyInvalid(regressions) {
  if (!Array.isArray(regressions) || regressions.length > 16) return true;
  return regressions.some(regressionInvalid);
}

function regressionInvalid(item) {
  return !item.metric || !['maximize', 'minimize'].includes(item.direction)
    || !Number.isFinite(item.maxRegression) || item.maxRegression < 0;
}

function metricNames(policy) {
  return [...new Set([policy.objective.metric, ...policy.regressions.map((item) => item.metric)])];
}

function arm(experimentId, role, options) {
  return { armId: `${experimentId}:${role}`, role, worldId: hash({ experimentId, role }),
    isolationId: `${experimentId}:${role}`, snapshotHash: options.snapshotHash,
    strategyId: role === 'candidate' ? options.candidate.candidateId : `parent:${options.snapshotHash}`,
    budget: options.worldBudget };
}

function isolatedWorldAdapter(options, candidate, branches) {
  return async (context) => {
    const world = await options.createCandidateBranch({ ...context,
      mutation: context.arm.role === 'candidate' ? candidate : null });
    if (!world?.branchId || world.production !== false || branches.has(world.branchId)) {
      throw error('GVX_REPAIR_BRANCH_ISOLATION_INVALID');
    }
    branches.add(world.branchId);
    return world;
  };
}

function worldEvaluationAdapter(options, candidate, dataset) {
  return async (context) => options.evaluateWorld({ ...context,
    mutation: context.arm.role === 'candidate' ? candidate : null,
    evaluationSet: { kind: 'sealed_holdout', digest: dataset.holdoutDigest,
      refs: [...dataset.holdoutRefs] } });
}

function experimentOptions(options, candidate, dataset) {
  const experimentId = hash({ traceId: options.trace.traceId, candidateHash: candidate.candidateHash,
    holdoutDigest: dataset.holdoutDigest, controls: options.controls });
  const policy = validatePolicy(options.decisionPolicy);
  const metrics = metricNames(policy);
  const branches = new Set();
  const planOptions = { snapshotHash: options.snapshotHash, candidate, worldBudget: options.worldBudget };
  return { db: options.db, scope: options.scope, entityId: options.entityId, experimentId,
    candidateHash: candidate.candidateHash, snapshotHash: options.snapshotHash,
    worldBudget: options.worldBudget, controls: { ...options.controls,
      holdoutDigest: dataset.holdoutDigest }, metricAllowlist: metrics,
    verifierRequirements: metrics.map((name) => `metric:${name}`), requireAttestation: true,
    experimentDesign: { type: 'paired', arms: [arm(experimentId, 'baseline', planOptions),
      arm(experimentId, 'candidate', planOptions)] }, verifierRegistry: options.verifierRegistry,
    artifactReader: options.artifactReader,
    createIsolatedWorld: isolatedWorldAdapter(options, candidate, branches),
    runWorld: worldEvaluationAdapter(options, candidate, dataset) };
}

function normalizedGain(direction, baseline, candidate) {
  return direction === 'maximize' ? candidate - baseline : baseline - candidate;
}

function assessComparison(outcomes, policy) {
  const byRole = new Map(outcomes.map((outcome) => [outcome.role, outcome.metrics]));
  const baseline = byRole.get('baseline');
  const candidate = byRole.get('candidate');
  if (!baseline || !candidate) return { status: 'rejected', reason: 'paired-outcomes-missing' };
  const gain = normalizedGain(policy.objective.direction, baseline[policy.objective.metric],
    candidate[policy.objective.metric]);
  if (!Number.isFinite(gain) || gain < policy.objective.minimumDelta) {
    return { status: 'rejected', reason: 'objective-not-improved', objectiveGain: gain };
  }
  const regression = policy.regressions.find((item) => {
    const improvement = normalizedGain(item.direction, baseline[item.metric], candidate[item.metric]);
    return !Number.isFinite(improvement) || improvement < -item.maxRegression;
  });
  return regression ? { status: 'rejected', reason: 'regression-limit-exceeded',
    metric: regression.metric, objectiveGain: gain }
    : { status: 'candidate_eligible_for_external_review', objectiveGain: gain };
}

async function appendAudit(options, payload) {
  const id = `gvx-trace-repair:${hash({ traceId: options.trace.traceId, kind: payload.kind,
    candidateId: payload.candidateId || null })}`;
  return ledger.appendEvent(options.db, { id, ...options.scope, entityId: options.entityId,
    type: 'decision_recorded', parentHash: options.snapshotHash,
    candidateHash: payload.candidateHash, payload: { ...payload, promotionAllowed: false } });
}

function attributionSummary(report) {
  return { kind: 'trace_locus_attribution', accepted: report.accepted.map((item) => ({
    hypothesisId: item.hypothesisId, locusId: item.locus.locusId, eventRefs: item.eventRefs,
    artifactHash: item.receipt.artifactHash })), rejected: report.rejected };
}

async function evaluateCandidate(options, candidate, dataset) {
  try {
    const experiment = await nursery.run(experimentOptions(options, candidate, dataset));
    const decision = experiment.assessment.status === 'ready_for_independent_review'
      ? assessComparison(experiment.outcomes, validatePolicy(options.decisionPolicy))
      : { status: 'rejected', reason: `experiment-${experiment.assessment.status}` };
    await appendAudit(options, { kind: 'trace_guided_candidate_decision', candidateId: candidate.candidateId,
      candidateHash: candidate.candidateHash, holdoutDigest: dataset.holdoutDigest,
      experimentId: experiment.experimentId, decision });
    return { candidate, experiment, decision, promotionAllowed: false };
  } catch (failure) {
    const decision = { status: 'evaluation_failed', reason: failure.code || failure.message };
    await appendAudit(options, { kind: 'trace_guided_candidate_decision', candidateId: candidate.candidateId,
      candidateHash: candidate.candidateHash, holdoutDigest: dataset.holdoutDigest, decision });
    return { candidate, decision, promotionAllowed: false };
  }
}

async function run(options) {
  const dataset = validateDatasets(options.datasets);
  validatePolicy(options.decisionPolicy);
  if (runtimeInputInvalid(options)) throw error('GVX_TRACE_REPAIR_INPUT_INVALID');
  const report = await attributionService.attribute(options);
  await appendAudit(options, attributionSummary(report));
  if (!report.accepted.length) return { status: 'attribution_rejected', attribution: report,
    evaluations: [], promotionAllowed: false };
  const plan = mutationPlanner.plan(report, { maxCandidates: options.maxCandidates || 4 });
  await appendAudit(options, { kind: 'trace_guided_mutation_plan', candidateCount: plan.candidates.length,
    rejected: plan.rejected, holdoutDigest: dataset.holdoutDigest });
  const evaluations = [];
  for (const candidate of plan.candidates) evaluations.push(await evaluateCandidate(options, candidate, dataset));
  const eligible = evaluations.filter((item) => item.decision.status === 'candidate_eligible_for_external_review');
  return { status: eligible.length ? 'external_review_required' : 'candidates_rejected',
    attribution: report, plan, evaluations, eligible, promotionAllowed: false };
}

function runtimeInputInvalid(options) {
  return scopeInputInvalid(options) || executionInputInvalid(options) || adapterInputInvalid(options);
}

function scopeInputInvalid(options) {
  return !options.db || !options.scope?.organizationId || !options.scope.projectId || !options.entityId;
}

function executionInputInvalid(options) {
  return !/^[a-f0-9]{64}$/.test(options.snapshotHash || '')
    || !Number.isFinite(options.worldBudget) || options.worldBudget <= 0;
}

function adapterInputInvalid(options) {
  return typeof options.createCandidateBranch !== 'function' || typeof options.evaluateWorld !== 'function';
}

module.exports = { validateDatasets, validatePolicy, metricNames, experimentOptions,
  assessComparison, appendAudit, run };
