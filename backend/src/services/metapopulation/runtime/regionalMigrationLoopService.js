'use strict';

const { evaluateTrigger } = require('../migration/adaptiveMigrationTriggerService');
const { selectCandidates } = require('../migration/migrationPolicyService');
const { evaluateMigrationValue } = require('../observability/regionalUtilityService');
const { validatePropagule } = require('../contracts/propaguleContract');
const migrationAdapters = require('../migration/migrationAdapterRegistry');
const migrationService = require('../migration/propaguleMigrationService');
const migrationStore = require('../migration/migrationStore');

function planMigrationAction(context) {
  if (context.input.enableMigration !== true) return { action: null, assessments: [] };
  const assessments = [];
  for (const request of requests(context.input)) {
    const trigger = evaluateTrigger(request.trigger || {});
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
  const candidates = selectCandidates(request.candidates, {
    policy: request.policy || 'novelty', targetDemeId: request.targetDemeId,
    sourceDemeId: request.sourceDemeId, limit: request.limit || 1,
    minFitness: request.minFitness, minNovelty: request.minNovelty
  });
  for (const candidate of candidates) {
    const corridor = findCorridor(observed.corridors, candidate);
    const utility = evaluateMigrationValue(candidate);
    if (!corridor || !migrationAdapters.resolveAdapter(candidate.type) || !isReceiver(request.receiver) || !utility.worthwhile) continue;
    const propagule = normalizePropagule(candidate, request);
    try { validatePropagule(propagule); }
    catch (_) { continue; }
    return { type: 'MIGRATE_PROPAGULE', corridorId: corridor.corridorId, propagule,
      receiver: request.receiver, utility, triggerReasons: evaluateTrigger(request.trigger).reasons };
  }
  return null;
}

async function executeMigrationAction(action, context) {
  const migration = await migrationService.offerPropagule({ metapopulationId: context.input.metapopulationId,
    corridorId: action.corridorId, propagule: action.propagule }, context.options);
  const resolved = await migrationService.reviewPropagule({ metapopulationId: context.input.metapopulationId,
    migrationId: migration.migrationId, receiverDemeId: action.propagule.targetDemeId,
    receiver: action.receiver }, context.options);
  return { type: action.type, migrationId: resolved.migrationId, status: resolved.status,
    selectionPolicy: action.propagule.selectionPolicy, utility: action.utility };
}

async function verifyMigrationActions(context) {
  const results = (Array.isArray(context.execution.results) ? context.execution.results : [])
    .filter((result) => result.type === 'MIGRATE_PROPAGULE');
  if (!results.length) return true;
  const verified = await Promise.all(results.map(async (result) => {
    const migration = await migrationStore.getMigration(context.options.db, context.input.metapopulationId, result.migrationId);
    return migration && ['ACCEPTED', 'REJECTED'].includes(migration.status) && migration.status === result.status;
  }));
  return verified.every(Boolean);
}

function requests(input) {
  return Array.isArray(input.migrationRequests)
    ? input.migrationRequests.filter((request) => request && typeof request === 'object' && !Array.isArray(request)) : [];
}
function isReceiver(receiver) { return Boolean(receiver && typeof receiver === 'object' && !Array.isArray(receiver)); }
function findCorridor(corridors, candidate) {
  return corridors.find((edge) => edge.enabled && edge.sourceDemeId === candidate.sourceDemeId &&
    edge.targetDemeId === candidate.targetDemeId && edge.capacity > 0);
}
function normalizePropagule(candidate, request) {
  return { ...candidate, migrationReason: candidate.migrationReason || request.reason || 'regional-adaptation' };
}

module.exports = { planMigrationAction, executeMigrationAction, verifyMigrationActions };
