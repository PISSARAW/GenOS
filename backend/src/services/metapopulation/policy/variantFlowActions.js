'use strict';

const migrationPolicyService = require('../migration/migrationPolicyService');
const { validatePropagule } = require('../contracts/propaguleContract');
const { evaluateMigrationValue } = require('../observability/regionalUtilityService');
const antiSynchronyService = require('../observability/antiSynchronyService');
const corridorGraphService = require('../migration/corridorGraphService');
const federatedRuntime = require('./federatedRuntimeService');

function routableMigrationAction(context) {
  const { candidate, observed, input, reason } = context;
  const propagule = validPropagule(candidate, reason);
  if (!propagule) return null;
  const corridor = findAdmissibleCorridor(observed, propagule);
  if (!corridor) return null;
  const receiver = receiverFor(input, propagule.targetDemeId);
  if (!receiver) return null;
  return { type: 'MIGRATE_PROPAGULE', corridorId: corridor.corridorId, propagule, receiver,
    utility: evaluateMigrationValue({ ...propagule, criticalRescue: false }), triggerReasons: ['VARIANT_DIRECTED'] };
}

function validPropagule(candidate, reason) {
  try {
    return validatePropagule({ ...candidate, migrationReason: candidate.migrationReason || reason || 'regional-adaptation' });
  } catch (_) {
    return null;
  }
}

function findAdmissibleCorridor(observed, propagule) {
  return (observed.corridors || []).find((edge) => edge.enabled && edge.capacity > 0
    && edge.sourceDemeId === propagule.sourceDemeId && edge.targetDemeId === propagule.targetDemeId);
}

function receiverFor(input, targetDemeId) {
  const receivers = input.receivers || {};
  if (receivers[targetDemeId] && typeof receivers[targetDemeId] === 'object') return receivers[targetDemeId];
  if (input.receiver && typeof input.receiver === 'object') return input.receiver;
  return null;
}

async function heterogeneousIslandsActions(observed, input, options) {
  const transfers = await heterogeneousCultureActions(observed, input);
  return [...diverseMigrationActions(observed, input), ...transfers];
}

function diverseMigrationActions(observed, input) {
  if (observed.variantPolicy?.diversityMode !== 'provider-algorithm-lineage') return [];
  const candidates = input.migrationCandidates || [];
  if (!candidates.length) return [];
  const selected = migrationPolicyService.selectCandidates(candidates, {
    diversityMode: 'provider-algorithm-lineage',
    antiHomogenization: true,
    targetProvider: input.targetProvider,
    targetAlgorithm: input.targetAlgorithm,
    targetLineages: input.targetLineages,
    limit: input.limit
  });
  const actions = [];
  for (const candidate of selected) {
    const action = routableMigrationAction({ candidate, observed, input, reason: 'complementary' });
    if (action) actions.push(action);
  }
  return actions;
}

async function heterogeneousCultureActions(observed, input) {
  if (observed.variantPolicy?.transferCulture !== true) return [];
  return (input.culturalTransfers || [])
    .filter((request) => migrationPolicyService.isVersionedCulture(request.culture))
    .map((request) => ({ type: 'TRANSFER_CULTURE', culture: request.culture, targetDemeId: request.targetDemeId }));
}

async function sourceSinkActions(observed, input, options) {
  const actions = [];
  const variantPolicy = observed.variantPolicy || {};
  if (variantPolicy.directedMigration !== true) return actions;
  const reserveRatio = Number(variantPolicy.sourceReserveRatio ?? 0.2);
  const sources = observed.demes.filter((d) => sourceCapacity(d) > 0.7 && d.status === 'ACTIVE');
  const sinks = observed.demes.filter((d) => sourceCapacity(d) < 0.4 && ['ACTIVE', 'STRESSED'].includes(d.status));
  for (const source of sources) {
    planSourceFlows({ actions, observed, input, source, sinks, reserveRatio });
  }
  return actions;
}

function planSourceFlows(context) {
  const { actions, observed, input, source, sinks, reserveRatio } = context;
  const utilization = sourceUtilization(source, input);
  if (utilization >= 1 - reserveRatio) {
    actions.push({ type: 'PROTECT_SOURCE', demeId: source.demeId, reason: 'SOURCE_EXHAUSTION_PROTECTION', utilization });
    return;
  }
  for (const sink of sinks) {
    if (source.demeId !== sink.demeId) planSinkFlow({ actions, observed, input, source, sink });
  }
}

function planSinkFlow(context) {
  const { actions, observed, input, source, sink } = context;
  const candidate = (input.migrationCandidates || []).find((c) => c.sourceDemeId === source.demeId && c.targetDemeId === sink.demeId)
    || sourceSinkCandidate(source, sink);
  const action = routableMigrationAction({ candidate, observed, input, reason: 'source-sink-flow' });
  if (action) actions.push({ ...action, direction: 'source_to_sink' });
}

function sourceCapacity(deme) {
  return Number(deme.contribution?.capacity ?? deme.capacity ?? 0.5);
}

function sourceUtilization(source, input) {
  const load = Number(input.sourceLoadByDeme?.[source.demeId] ?? source.migrationLoad ?? 0);
  const capacity = Number(input.sourceCapacityByDeme?.[source.demeId] ?? sourceCapacity(source));
  return capacity > 0 ? load / capacity : 0;
}

function sourceSinkCandidate(source, sink) {
  return { propaguleId: `source-sink-${source.demeId}-${sink.demeId}`, type: 'AGENT',
    sourceDemeId: source.demeId, targetDemeId: sink.demeId, payloadRef: source.demeId,
    migrationReason: 'source-sink-flow', lineageRefs: source.lineage?.founders || [],
    sourceEvidence: [], provenance: { source: 'source-sink-variant' },
    sourceFitness: sourceCapacity(source), novelty: 0.5, compatibility: 0.8 };
}

async function steppingStoneActions(observed, input, options) {
  return [
    ...rareMigrationTrigger(observed, input),
    ...pairMigrationActions(observed, input),
    ...bridgeCollapseActions(observed)
  ];
}

function rareMigrationTrigger(observed, input) {
  if (observed.variantPolicy?.migrationFrequency !== 'rare') return [];
  const { calculateAdaptiveInterval } = require('../migration/adaptiveMigrationTriggerService');
  const interval = calculateAdaptiveInterval({ variant: 'stepping_stone', baseInterval: 10 });
  return input.generation % interval === 0
    ? [{ type: 'TRIGGER_STEPPING_STONE_MIGRATION', interval }]
    : [];
}

function pairMigrationActions(observed, input) {
  if (observed.variantPolicy?.corridorTopology !== 'stepping-stone') return [];
  const actions = [];
  const pairs = steppingStonePairs(observed.demes.map((d) => d.demeId).sort());
  for (const [source, target] of pairs) {
    const action = pairMigration({ observed, input, source, target });
    if (action) actions.push(action);
  }
  return actions;
}

function pairMigration(context) {
  const { observed, input, source, target } = context;
  const corridor = observed.corridors.find((c) => c.sourceDemeId === source && c.targetDemeId === target);
  if (!corridor || !corridor.enabled) return null;
  const candidates = (input.migrationCandidates || []).filter((c) => c.sourceDemeId === source && c.targetDemeId === target);
  const selected = migrationPolicyService.selectCandidates(candidates, { policy: 'cultural', limit: 1 });
  if (!selected.length) return null;
  return routableMigrationAction({ candidate: selected[0], observed, input, reason: 'stepping-stone' });
}

function bridgeCollapseActions(observed) {
  return observed.demes.filter((d) => d.isBridge === true && d.status === 'COLLAPSED')
    .map((bridge) => ({ type: 'HANDLE_BRIDGE_EXTINCTION', bridgeDemeId: bridge.demeId }));
}

function steppingStonePairs(nodes) {
  const pairs = nodes.map((node, index) => [node, nodes[(index + 1) % nodes.length]]);
  const bidirectional = pairs.map(([source, target]) => [target, source]);
  return [...pairs, ...bidirectional].filter(([source, target]) => source !== target);
}

async function antiSynchronyActions(observed, input, options) {
  return [
    ...firebreakRegulationActions(observed, input),
    ...diversityFloorActions(observed),
    ...topologyRewireActions(observed, input, options),
    ...extinctionCoverageActions(observed)
  ];
}

function firebreakRegulationActions(observed, input) {
  if (observed.variantPolicy?.firebreaks !== true) return [];
  const synchronyPlan = antiSynchronyService.planAntiSynchrony({
    demes: observed.demes,
    observations: input.errorVectors,
    threshold: input.synchronyThreshold,
    freeze: true
  });
  return synchronyPlan.affectedPairs.length > 0
    ? [{ type: 'REGULATE_CORRIDORS', pairs: synchronyPlan.affectedPairs, freeze: true }]
    : [];
}

function diversityFloorActions(observed) {
  const diversityFloor = observed.variantPolicy?.diversityFloor || 0.3;
  const currentDiversity = observed.demes.reduce((sum, d) => sum + (d.diversity || 0), 0) / Math.max(1, observed.demes.length);
  return currentDiversity < diversityFloor
    ? [{ type: 'DIVERSITY_FLOOR_BREACH', currentDiversity, floor: diversityFloor }]
    : [];
}

async function topologyRewireActions(observed, input, options) {
  if (observed.variantPolicy?.topologyRewire !== true) return [];
  const proposed = await corridorGraphService.planTopology(input.metapopulationId, {
    ...options, candidateEdges: observed.corridors
  });
  return sameCorridorPairs(observed.corridors, proposed)
    ? []
    : [{ type: 'REWIRE_VARIANT_TOPOLOGY', corridors: observed.corridors }];
}

function extinctionCoverageActions(observed) {
  if (observed.variantPolicy?.controlledExtinctionWithCoverage !== true) return [];
  const actions = [];
  for (const deme of observed.demes.filter((d) => d.status === 'AT_RISK')) {
    actions.push(coverageDecision(observed, deme));
  }
  return actions;
}

function coverageDecision(observed, deme) {
  const uniqueCapabilities = (deme.capabilities || []).filter((cap) => uncoveredCapability(observed, deme, cap));
  return uniqueCapabilities.length === 0
    ? { type: 'ALLOW_CONTROLLED_EXTINCTION', demeId: deme.demeId }
    : { type: 'PROTECT_FROM_EXTINCTION', demeId: deme.demeId, uniqueCapabilities };
}

function uncoveredCapability(observed, deme, capability) {
  return !observed.demes.some((other) => other.demeId !== deme.demeId && (other.capabilities || []).includes(capability));
}

function sameCorridorPairs(current, proposed) {
  const keys = (items) => items.map((item) => `${item.sourceDemeId}->${item.targetDemeId}:${item.capacity}:${item.enabled}`).sort();
  return JSON.stringify(keys(current)) === JSON.stringify(keys(proposed));
}

async function federatedActions(observed, input, options) {
  return [
    ...verifiedTransferActions(observed, input),
    ...sovereigntyActions(observed),
    ...proofActions(observed, input),
    ...attestationActions(observed, input)
  ];
}

function verifiedTransferActions(observed, input) {
  if (observed.variantPolicy?.verifiedPropagulesOnly !== true) return [];
  const actions = [];
  for (const candidate of input.migrationCandidates || []) {
    const authorized = authorizeFederationTransfer({
      classification: candidate.classification || 'LOCAL_ONLY',
      sourceRegion: candidate.sourceRegion,
      targetRegion: candidate.targetRegion,
      federationAgreement: candidate.federationAgreement
    });
    if (!authorized.allowed) {
      actions.push({ type: 'REJECT_FEDERATED_TRANSFER', propaguleId: candidate.propaguleId, reason: authorized.reason });
    } else if (candidate.requiresRedaction === true) {
      actions.push({ type: 'REDACT_PROPAGULE', propaguleId: candidate.propaguleId, fields: candidate.redactionFields });
    }
  }
  return actions;
}

function sovereigntyActions(observed) {
  if (observed.variantPolicy?.sovereign !== true) return [];
  return observed.demes.filter((deme) => deme.sovereigntyPolicy && !deme.sovereigntyPolicy.acknowledged)
    .map((deme) => ({ type: 'REQUIRE_SOVEREIGNTY_ACKNOWLEDGMENT', demeId: deme.demeId, policy: deme.sovereigntyPolicy }));
}

function proofActions(observed, input) {
  if (observed.variantPolicy?.requireDataMinimizationProof !== true) return [];
  return federatedRuntime.planFederatedProofActions(input.migrationCandidates, input.crossRegionContracts);
}

function attestationActions(observed, input) {
  if (observed.variantPolicy?.requireReceiverAttestation !== true) return [];
  return (input.migrationCandidates || [])
    .filter((candidate) => candidate.sourceRegion && candidate.targetRegion)
    .map((candidate) => ({ type: 'REQUIRE_RECEIVER_ATTESTATION', propaguleId: candidate.propaguleId, targetRegion: candidate.targetRegion }));
}

function authorizeFederationTransfer(input) {
  const CLASSIFICATIONS = ['PUBLIC', 'REGIONAL', 'SENSITIVE', 'LOCAL_ONLY'];
  const classification = String(input.classification || 'LOCAL_ONLY').toUpperCase();
  if (!CLASSIFICATIONS.includes(classification)) throw Object.assign(new Error('Unknown data classification.'), { code: 'METAPOPULATION_CLASSIFICATION_INVALID' });
  const trustedRegion = Boolean(input.sourceRegion && input.sourceRegion === input.targetRegion);
  const allowed = classification === 'PUBLIC' || classification === 'REGIONAL' && (trustedRegion || input.federationAgreement === true);
  return { allowed, classification, sourceRegion: input.sourceRegion || null, targetRegion: input.targetRegion || null, reason: allowed ? 'SOVEREIGNTY_POLICY_SATISFIED' : 'SOVEREIGNTY_POLICY_DENIED' };
}

async function culturalActions(observed, input, options) {
  return [
    ...cultureTransferRequests(observed, input),
    ...cultureMutationRequests(input),
    ...phylogenyRequests(observed)
  ];
}

function cultureTransferRequests(observed, input) {
  if (observed.variantPolicy?.artifactsOnly !== true) return [];
  const actions = [];
  for (const transfer of input.culturalTransfers || []) {
    if (migrationPolicyService.isVersionedCulture(transfer.culture)) {
      actions.push(compatibilityDecision(observed, transfer));
    }
  }
  return actions;
}

function compatibilityDecision(observed, transfer) {
  const compatibility = checkCulturalCompatibility(transfer.culture, observed.demes.find((d) => d.demeId === transfer.targetDemeId));
  return compatibility.compatible
    ? { type: 'TRANSFER_CULTURE', culture: transfer.culture, targetDemeId: transfer.targetDemeId, transmission: transfer.transmission || 'horizontal' }
    : { type: 'REJECT_CULTURE_TRANSFER', cultureId: transfer.culture.id, reason: compatibility.reason };
}

function cultureMutationRequests(input) {
  return (input.culturalMutations || [])
    .map((mutation) => ({ type: 'MUTATE_CULTURE', cultureId: mutation.cultureId, mutation }));
}

function phylogenyRequests(observed) {
  return observed.variantPolicy?.culturalPhylogeny === true
    ? [{ type: 'BUILD_CULTURAL_PHYLOGENY', demes: observed.demes }]
    : [];
}

function checkCulturalCompatibility(culture, targetDeme) {
  if (!targetDeme) return { compatible: false, reason: 'TARGET_DEME_NOT_FOUND' };
  const parentRefs = culture.parentRefs || [];
  const targetLineage = targetDeme.lineage?.founders || [];
  const hasCommonAncestor = parentRefs.some((ref) => targetLineage.includes(ref));
  if (!hasCommonAncestor && parentRefs.length > 0) {
    return { compatible: false, reason: 'NO_COMMON_ANCESTOR' };
  }
  return { compatible: true };
}

module.exports = { heterogeneousIslandsActions, heterogeneousCultureActions, sourceSinkActions, steppingStoneActions, antiSynchronyActions, federatedActions, culturalActions, routableMigrationAction };
