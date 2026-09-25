'use strict';

const { evaluateTrigger } = require('../migration/adaptiveMigrationTriggerService');
const { selectCandidates } = require('../migration/migrationPolicyService');
const { evaluateMigrationValue } = require('../observability/regionalUtilityService');
const { validatePropagule } = require('../contracts/propaguleContract');
const migrationAdapters = require('../migration/migrationAdapterRegistry');
const migrationService = require('../migration/propaguleMigrationService');
const migrationStore = require('../migration/migrationStore');
const rescueService = require('../migration/rescueEffectService');
const metapopulationStore = require('../metapopulationStore');
const { authorizeFederationTransfer } = require('../policy/metapopulationPolicyService');

function planMigrationAction(context) {
  if (context.input.enableMigration !== true) return { action: null, assessments: [] };
  const assessments = [];
  for (const request of requests(context.input)) {
    const policy = context.observed.variantPolicy || {};
    const trigger = evaluateTrigger({
      ...(request.trigger || {}),
      generationInterval: request.trigger?.generationInterval || frequencyInterval(policy.migrationFrequency),
      generation: request.trigger?.generation ?? context.input.generation
    });
    if (!trigger.triggered) {
      assessments.push({ targetDemeId: request.targetDemeId, reason: trigger.blockedBy[0] || 'TRIGGER_NOT_MET' });
      continue;
    }
    const action = selectEligibleAction(request, context.observed);
    if (action) return { action, assessments };
    assessments.push({ targetDemeId: request.targetDemeId, reason: 'NO_VERIFIED_CANDIDATE' });
  }
  return { action: null, assessments };
}

function selectEligibleAction(request, observed) {
  const variantPolicy = observed.variantPolicy || {};
  const candidates = selectCandidates(request.candidates, {
    policy: request.policy || variantPolicy.migration || 'novelty',
    diversityMode: variantPolicy.diversityMode,
    targetDemeId: request.targetDemeId,
    sourceDemeId: request.sourceDemeId, limit: request.limit || 1,
    minFitness: request.minFitness, minNovelty: request.minNovelty
  });
  for (const candidate of candidates) {
    if (!federationEligible(candidate, request, variantPolicy)) continue;
    const action = candidateAction(candidate, request, observed);
    if (action) return action;
  }
  return null;
}

function federationEligible(candidate, request, policy) {
  if (!policy.sovereign) return true;
  if (policy.verifiedPropagulesOnly && candidate.transferProof?.verified !== true) return false;
  return authorizeFederationTransfer({
    classification: candidate.dataClassification,
    sourceRegion: request.sourceRegion,
    targetRegion: request.targetRegion,
    federationAgreement: request.federationAgreement === true,
    refs: candidate.transferRefs
  }).allowed;
}

function frequencyInterval(frequency) {
  if (frequency === 'rare') return 10;
  if (frequency === 'periodic') return 5;
  return undefined;
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
  return Boolean(context.corridor && context.adapter && isReceiver(context.request.receiver) &&
    context.utility.worthwhile && rescueAttemptsAvailable(context.candidate, context.request, context.observed) &&
    rescueAdapterReady(context.candidate, context.request, context.adapter));
}

async function executeMigrationAction(action, context) {
  const rescue = action.propagule.migrationReason.toLowerCase() === 'rescue';
  const rescueContext = rescue ? await prepareRescue(action, context) : null;
  const migration = await migrationService.offerPropagule({ metapopulationId: context.input.metapopulationId,
    corridorId: action.corridorId, propagule: action.propagule }, context.options);
  const resolved = await migrationService.reviewPropagule({ metapopulationId: context.input.metapopulationId,
    migrationId: migration.migrationId, receiverDemeId: action.propagule.targetDemeId,
    receiver: action.receiver }, context.options);
  const outcome = resolved.status === 'ACCEPTED' && rescue
    ? await completeRescue({ action, migration: resolved, state: rescueContext, context }) : null;
  return { type: action.type, migrationId: resolved.migrationId, status: outcome?.status || resolved.status,
    selectionPolicy: action.propagule.selectionPolicy, utility: action.utility, rescueOutcome: outcome };
}

async function verifyMigrationActions(context) {
  const results = (Array.isArray(context.execution.results) ? context.execution.results : [])
    .filter((result) => result.type === 'MIGRATE_PROPAGULE');
  if (!results.length) return true;
  const verified = await Promise.all(results.map(async (result) => {
    const migration = await migrationStore.getMigration(context.options.db, context.input.metapopulationId, result.migrationId);
    const terminal = ['ACCEPTED', 'REJECTED', 'ROLLED_BACK'].includes(migration?.status);
    const rescueEvidence = !result.rescueOutcome || Boolean(migration?.evidence.rescueOutcome);
    return migration && terminal && migration.status === result.status && rescueEvidence;
  }));
  return verified.every(Boolean);
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

async function prepareRescue(action, context) {
  const { input, options } = context;
  const deme = await metapopulationStore.getDeme(options.db, input.metapopulationId, action.propagule.targetDemeId);
  const storedFitness = fitnessScore(deme?.fitness);
  const maxFitness = Number(action.rescueOptions.maxTargetFitness ?? 0.35);
  if (!deme || storedFitness > maxFitness) throw rescueError('RESCUE_TARGET_NOT_AT_RISK');
  const used = await migrationStore.countRescueAttempts(options.db, input.metapopulationId, deme.demeId);
  if (used >= action.rescueOptions.maxAttempts) throw rescueError('RESCUE_ATTEMPT_LIMIT');
  const adapter = migrationAdapters.resolveAdapter(action.propagule.type);
  const baseline = measuredFitness(await adapter.measureFitness({ receiver: action.receiver,
    demeId: deme.demeId, phase: 'before', propagule: action.propagule }));
  if (baseline > maxFitness) throw rescueError('RESCUE_TARGET_NOT_AT_RISK');
  return { deme, baseline, adapter };
}

async function completeRescue({ action, migration, state, context }) {
  const after = measuredFitness(await state.adapter.measureFitness({ receiver: action.receiver,
    demeId: state.deme.demeId, phase: 'after', migrationId: migration.migrationId }));
  const outcome = rescueService.evaluateRescueOutcome({ trialId: migration.migrationId,
    baselineFitness: state.baseline, fitnessAfter: after,
    allowedRegression: action.rescueOptions.allowedRegression,
    corridorPenalty: action.rescueOptions.corridorPenalty });
  const status = outcome.rollback
    ? await rollbackRescue({ action, migration, outcome, context }) : 'ACCEPTED';
  const finalFitness = outcome.rollback
    ? measuredFitness(await state.adapter.measureFitness({ receiver: action.receiver,
      demeId: state.deme.demeId, phase: 'after-rollback', migrationId: migration.migrationId })) : after;
  if (outcome.rollback && finalFitness < state.baseline - action.rescueOptions.allowedRegression) {
    throw rescueError('RESCUE_ROLLBACK_REGRESSION');
  }
  await persistRescueFitness(state.deme, finalFitness, context);
  await migrationStore.recordRescueOutcome(context.options.db, context.input.metapopulationId,
    { migrationId: migration.migrationId, outcome: { ...outcome, finalFitness, status } });
  return { ...outcome, finalFitness, status };
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

module.exports = { planMigrationAction, executeMigrationAction, verifyMigrationActions };
