'use strict';

const { evaluateTrigger, calculateAdaptiveInterval } = require('../migration/adaptiveMigrationTriggerService');
const { selectCandidates } = require('../migration/migrationPolicyService');
const { evaluateMigrationValue } = require('../observability/regionalUtilityService');
const { validatePropagule } = require('../contracts/propaguleContract');
const migrationAdapters = require('../migration/migrationAdapterRegistry');
const migrationService = require('../migration/propaguleMigrationService');
const migrationStore = require('../migration/migrationStore');
const { recordRescueEvidence } = require('../migration/rescueEvidenceStore');
const rescueService = require('../migration/rescueEffectService');
const metapopulationStore = require('../metapopulationStore');
const { authorizeFederationTransfer } = require('../policy/metapopulationPolicyService');

function planMigrationAction(context) {
  if (context.input.enableMigration !== true) return { action: null, assessments: [] };
  const assessments = [];
  for (const request of requests(context.input)) {
    const assessment = assessMigrationRequest(request, context);
    if (assessment.action) return { action: assessment.action, assessments };
    if (assessment.reason) assessments.push(assessment);
  }
  return { action: null, assessments };
}

function assessMigrationRequest(request, context) {
  const policy = context.observed.variantPolicy || {};
  const variant = context.observed.variant || 'balanced';
  const adaptiveInterval = calculateAdaptiveInterval({ variant, ...request.trigger,
    generation: request.trigger?.generation ?? context.input.generation,
    baseInterval: frequencyInterval(policy.migrationFrequency, request.trigger) });
  const trigger = evaluateTrigger({ ...(request.trigger || {}), variant,
    generationInterval: request.trigger?.generationInterval || adaptiveInterval,
    generation: request.trigger?.generation ?? context.input.generation });
  if (!trigger.triggered) return { targetDemeId: request.targetDemeId,
    reason: trigger.blockedBy[0] || 'TRIGGER_NOT_MET', adaptiveInterval };
  const action = selectEligibleAction(request, context.observed);
  if (!action) return { targetDemeId: request.targetDemeId, reason: 'NO_VERIFIED_CANDIDATE' };
  return { action };
}

function selectEligibleAction(request, observed) {
  const variantPolicy = observed.variantPolicy || {};
  const variant = observed.variant || 'balanced';
  let candidates;

  if (variant === 'island_search') {
    candidates = selectIslandSearchCandidates(request, variantPolicy, observed);
  } else {
    candidates = selectCandidates(request.candidates, {
      policy: request.policy || variantPolicy.migration || 'novelty',
      diversityMode: variantPolicy.diversityMode,
      requireVersionedCulture: variantPolicy.artifactsOnly === true,
      targetDemeId: request.targetDemeId,
      sourceDemeId: request.sourceDemeId, limit: request.limit || 1,
      minFitness: request.minFitness, minNovelty: request.minNovelty
    });
  }

  for (const candidate of candidates) {
    if (!federationEligible(candidate, request, variantPolicy)) continue;
    const action = candidateAction(candidate, { ...request, sourceReserveRatio: variantPolicy.sourceReserveRatio }, observed);
    if (action) return action;
  }
  return null;
}

function selectIslandSearchCandidates(request, variantPolicy, observed) {
  const eliteCandidates = selectCandidates(request.candidates, {
    policy: 'elite',
    targetDemeId: request.targetDemeId,
    sourceDemeId: request.sourceDemeId,
    limit: Math.max(1, Math.floor((request.limit || 2) / 2)),
    minFitness: request.minFitness
  });

  const counterexampleCandidates = selectCandidates(request.candidates, {
    policy: 'counterexample',
    targetDemeId: request.targetDemeId,
    sourceDemeId: request.sourceDemeId,
    limit: Math.max(1, Math.floor((request.limit || 2) / 2)),
    minNovelty: request.minNovelty
  });

  return [...eliteCandidates, ...counterexampleCandidates];
}

function federationEligible(candidate, request, policy) {
  if (!policy.sovereign) return true;
  if (policy.verifiedPropagulesOnly && (candidate.transferProof?.verified !== true
    || candidate.transferProof?.dataMinimized !== true || candidate.transferProof?.redacted !== true
    || request.receiverAttestation?.verified !== true)) return false;
  return authorizeFederationTransfer({
    classification: candidate.dataClassification,
    sourceRegion: request.sourceRegion,
    targetRegion: request.targetRegion,
    federationAgreement: request.federationAgreement === true,
    refs: candidate.transferRefs
  }).allowed;
}

function frequencyInterval(frequency, trigger = {}) {
  const base = frequency === 'rare' ? 10 : frequency === 'periodic' ? 5 : 0;
  if (!base) return undefined;
  return calculateAdaptiveInterval({ ...trigger, baseInterval: base });
}

function candidateAction(candidate, request, observed) {
  const corridor = findCorridor(observed.corridors, candidate);
  const utility = evaluateMigrationValue({ ...candidate, criticalRescue: isCriticalRescue(candidate, request, observed) });
  const adapter = migrationAdapters.resolveAdapter(candidate.type);
  if (!isActionEligible({ candidate, request, observed, corridor, utility, adapter })) return null;
  const propagule = normalizePropagule(candidate, request);
  try { validatePropagule(propagule); }
  catch (_) { return null; }
  return { type: 'MIGRATE_PROPAGULE', corridorId: corridor.corridorId, propagule,
    receiver: request.receiver, utility, triggerReasons: evaluateTrigger(request.trigger).reasons,
    rescueOptions: rescueOptions(request) };
}

function isActionEligible(context) {
  if (!residentPair(context.candidate, context.observed.demes)) return false;
  return Boolean(context.corridor && context.adapter && isReceiver(context.request.receiver) &&
    sourceCapacityAvailable(context.candidate, context.request, context.observed) &&
    context.utility.worthwhile && rescueAttemptsAvailable(context.candidate, context.request, context.observed) &&
    rescueAdapterReady(context.candidate, context.request, context.adapter));
}

function residentPair(candidate, demes) {
  const ids = [candidate.sourceDemeId, candidate.targetDemeId];
  return ids.every((id) => demes.some((deme) => deme.demeId === id
    && ['ACTIVE', 'STRESSED', 'AT_RISK', 'ESTABLISHING'].includes(deme.status)));
}

function sourceCapacityAvailable(candidate, request, observed) {
  if (!Number.isFinite(request.sourceReserveRatio)) return true;
  const source = observed.demes.find((deme) => deme.demeId === candidate.sourceDemeId);
  const patch = observed.patches.find((item) => item.patchId === source?.patchId);
  const capacity = Number(source?.availableMigrationCapacity ?? source?.migrationCapacity
    ?? patch?.resources?.migrationCapacity);
  if (!Number.isFinite(capacity)) return true;
  const demand = Number.isFinite(candidate.capacityDemand) ? candidate.capacityDemand : 1;
  return capacity - demand >= capacity * request.sourceReserveRatio;
}

async function executeMigrationAction(action, context) {
  const existing = await migrationStore.getMigration(context.options.db, context.input.metapopulationId, action.propagule.propaguleId);
  const migration = await migrationService.offerPropagule({ metapopulationId: context.input.metapopulationId,
    corridorId: action.corridorId, propagule: action.propagule }, context.options);
  const rescue = action.propagule.migrationReason.toLowerCase() === 'rescue';
  if (existing && ['ACCEPTED', 'REJECTED', 'ROLLED_BACK'].includes(existing.status)) {
    return resumeResolvedMigration(action, existing, context);
  }
  const rescueContext = rescue ? await prepareRescue(action, context, migration) : null;
  const resolved = await migrationService.reviewPropagule({ metapopulationId: context.input.metapopulationId,
    migrationId: migration.migrationId, receiverDemeId: action.propagule.targetDemeId,
    receiver: action.receiver }, context.options);
  const outcome = resolved.status === 'ACCEPTED' && rescue
    ? await completeRescue({ action, migration: resolved, state: rescueContext, context }) : null;
  return { type: action.type, migrationId: resolved.migrationId, status: outcome?.status || resolved.status,
    selectionPolicy: action.propagule.selectionPolicy, utility: action.utility, rescueOutcome: outcome };
}

async function resumeResolvedMigration(action, migration, context) {
  let outcome = migration.evidence.rescueOutcome || null;
  if (migration.evidence.migrationReason === 'rescue' && migration.status !== 'REJECTED' && !outcome) {
    const baseline = migration.evidence.rescueBaseline;
    if (!baseline) throw rescueError('RESCUE_BASELINE_MISSING');
    const deme = await metapopulationStore.getDeme(context.options.db, context.input.metapopulationId, migration.targetDemeId);
    const state = { deme, baseline: measuredFitness(baseline.score), adapter: migrationAdapters.resolveAdapter(migration.type) };
    outcome = await completeRescue({ action, migration, state, context });
  }
  return { type: action.type, migrationId: migration.migrationId, status: outcome?.status || migration.status,
    rescueOutcome: outcome, resumed: true };
}

async function verifyMigrationActions(context) {
  const results = (Array.isArray(context.execution.results) ? context.execution.results : [])
    .filter((result) => result.type === 'MIGRATE_PROPAGULE');
  const expected = context.plan.actions.filter((action) => action.type === 'MIGRATE_PROPAGULE');
  if (expected.length !== results.length) return false;
  if (!results.length) return true;
  const verified = await Promise.all(results.map((result) => verifyMigrationResult(result, context)));
  return verified.every(Boolean);
}

async function verifyMigrationResult(result, context) {
  const migration = await migrationStore.getMigration(context.options.db, context.input.metapopulationId, result.migrationId);
  if (!migration || !['ACCEPTED', 'REJECTED', 'ROLLED_BACK'].includes(migration.status)) return false;
  if (migration.evidence.migrationReason === 'rescue' && migration.status !== 'REJECTED'
    && !migration.evidence.rescueOutcome) return false;
  return migration.status === result.status && context.plan.actions.some((action) =>
    action.propagule?.propaguleId === migration.migrationId
    && action.propagule.sourceDemeId === migration.sourceDemeId && action.propagule.targetDemeId === migration.targetDemeId);
}

function requests(input) {
  return Array.isArray(input.migrationRequests)
    ? input.migrationRequests.filter((request) => request && typeof request === 'object' && !Array.isArray(request)) : [];
}

function rescueAdapterReady(candidate, request, adapter) {
  if (rescueReason(candidate, request) !== 'rescue') return true;
  return typeof adapter.measureFitness === 'function' && typeof adapter.rollback === 'function' &&
    Number(candidate.targetFitness) <= Number(request.maxTargetFitness ?? 0.35) &&
    Number(candidate.compatibility) >= Number(request.minimumCompatibility ?? 0.6);
}

function rescueAttemptsAvailable(candidate, request, observed) {
  if (rescueReason(candidate, request) !== 'rescue') return true;
  const maxAttempts = Number.isSafeInteger(request.maxAttempts) && request.maxAttempts > 0 ? request.maxAttempts : 3;
  return Number(observed.rescueAttempts?.[candidate.targetDemeId] || 0) < maxAttempts;
}

function isCriticalRescue(candidate, request, observed) {
  if (rescueReason(candidate, request) !== 'rescue' || candidate.criticalRescue !== true) return false;
  const target = observed.demes.find((deme) => deme.demeId === candidate.targetDemeId);
  const contribution = observed.contribution.demes.find((deme) => deme.demeId === candidate.targetDemeId);
  return ['AT_RISK', 'STRESSED'].includes(target?.status) && contribution?.protectedFromLocalCull === true;
}

async function prepareRescue(action, context, migration) {
  const { input, options } = context;
  const deme = await metapopulationStore.getDeme(options.db, input.metapopulationId, action.propagule.targetDemeId);
  const storedFitness = fitnessScore(deme?.fitness);
  const maxFitness = Number(action.rescueOptions.maxTargetFitness ?? 0.35);
  if (!deme || storedFitness > maxFitness) throw rescueError('RESCUE_TARGET_NOT_AT_RISK');
  const used = await migrationStore.countRescueAttempts(options.db, input.metapopulationId, deme.demeId);
  if (used > action.rescueOptions.maxAttempts) throw rescueError('RESCUE_ATTEMPT_LIMIT');
  const adapter = migrationAdapters.resolveAdapter(action.propagule.type);
  const baseline = migration.evidence.rescueBaseline ? measuredFitness(migration.evidence.rescueBaseline.score)
    : measuredFitness(await adapter.measureFitness({ receiver: action.receiver,
      demeId: deme.demeId, phase: 'before', propagule: action.propagule }));
  if (!migration.evidence.rescueBaseline) await recordRescueEvidence(options.db, input.metapopulationId,
    { migrationId: migration.migrationId, baseline: { score: baseline, demeId: deme.demeId } });
  if (baseline > maxFitness) throw rescueError('RESCUE_TARGET_NOT_AT_RISK');
  return { deme, baseline, adapter };
}

async function completeRescue({ action, migration, state, context }) {
  const after = migration.evidence.rescueAssessment?.fitnessAfter ?? measuredFitness(await state.adapter.measureFitness({ receiver: action.receiver,
    demeId: state.deme.demeId, phase: 'after', migrationId: migration.migrationId }));
  const outcome = migration.evidence.rescueAssessment || rescueService.evaluateRescueOutcome({ trialId: migration.migrationId,
    baselineFitness: state.baseline, fitnessAfter: after,
    allowedRegression: action.rescueOptions.allowedRegression,
    corridorPenalty: action.rescueOptions.corridorPenalty });
  if (!migration.evidence.rescueAssessment) await recordRescueEvidence(context.options.db, context.input.metapopulationId,
    { migrationId: migration.migrationId, assessment: outcome });
  const status = await rescueTerminalStatus({ action, migration, outcome, context });
  const finalFitness = outcome.rollback
    ? measuredFitness(await state.adapter.measureFitness({ receiver: action.receiver,
      demeId: state.deme.demeId, phase: 'after-rollback', migrationId: migration.migrationId })) : after;
  if (outcome.rollback && finalFitness < state.baseline - action.rescueOptions.allowedRegression) {
    throw rescueError('RESCUE_ROLLBACK_REGRESSION');
  }
  const { withTransaction } = require('../../../db');
  await withTransaction(context.options.db, async () => {
    await persistRescueFitness(state.deme, finalFitness, context);
    await migrationStore.recordRescueOutcome(context.options.db, context.input.metapopulationId,
      { migrationId: migration.migrationId, outcome: { ...outcome, finalFitness, status } });
  });
  return { ...outcome, finalFitness, status };
}

async function rescueTerminalStatus(context) {
  if (context.migration.status === 'ROLLED_BACK') return 'ROLLED_BACK';
  return context.outcome.rollback ? rollbackRescue(context) : 'ACCEPTED';
}

async function rollbackRescue({ action, migration, outcome, context }) {
  const result = await migrationService.rollbackRescue({ metapopulationId: context.input.metapopulationId,
    migrationId: migration.migrationId, receiver: action.receiver, outcome,
    corridorPenalty: outcome.corridorPenalty, reason: 'Verified local fitness regression.' }, context.options);
  return result.status;
}

async function persistRescueFitness(deme, score, context) {
  await metapopulationStore.updateDemeProfile(context.options.db, {
    metapopulationId: context.input.metapopulationId, demeId: deme.demeId,
    changes: { fitness: { ...deme.fitness, score } }
  });
}

function rescueOptions(request) {
  return { maxAttempts: Number.isSafeInteger(request.maxAttempts) && request.maxAttempts > 0 ? request.maxAttempts : 3,
    maxTargetFitness: bounded(request.maxTargetFitness, 0.35),
    allowedRegression: bounded(request.allowedRegression, 0), corridorPenalty: bounded(request.corridorPenalty, 0.15) };
}

function rescueReason(candidate, request) {
  return String(candidate.migrationReason || request.reason || '').trim().toLowerCase();
}

function fitnessScore(fitness) { return Number(fitness?.score ?? fitness?.local); }
function measuredFitness(value) {
  const score = Number(typeof value === 'number' ? value : value?.score);
  if (!Number.isFinite(score) || score < 0 || score > 1) throw rescueError('RESCUE_FITNESS_MEASUREMENT_INVALID');
  return score;
}
function bounded(value, fallback) { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback; }
function rescueError(code) { return Object.assign(new Error(code), { code }); }
function isReceiver(receiver) { return Boolean(receiver && typeof receiver === 'object' && !Array.isArray(receiver)); }
function findCorridor(corridors, candidate) {
  return corridors.find((edge) => edge.enabled && edge.sourceDemeId === candidate.sourceDemeId &&
    edge.targetDemeId === candidate.targetDemeId && edge.capacity > 0);
}
function normalizePropagule(candidate, request) {
  return { ...candidate, migrationReason: rescueReason(candidate, request) === 'rescue'
    ? 'rescue' : candidate.migrationReason || request.reason || 'regional-adaptation' };
}

module.exports = { planMigrationAction, executeMigrationAction, verifyMigrationActions, candidateAction };
