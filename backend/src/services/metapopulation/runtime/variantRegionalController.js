'use strict';

const recolonization = require('../patches/recolonizationService');
const corridors = require('../migration/corridorGraphService');
const variantRuntime = require('../policy/variantRuntimeService');
const variantActionExecutors = require('./variantActionExecutors');
const variantActionVerifiers = require('./variantActionVerifiers');

async function planVariantActions(context) {
  await planPopulationFeatures(context);
  planSearchFeatures(context);
  await planTopologyChange(context);
  if (context.observed.variantPolicy?.ephemeral === true) {
    planEphemeralPatches(context.plan, context.observed, context.input);
  }
  planFirebreakFeatures(context);
  await appendRuntimeVariantActions(context);
  return context.plan;
}

async function appendRuntimeVariantActions(context) {
  const { plan, observed, input, options } = context;
  if (!variantRuntime.VARIANT_RUNTIME_ACTIONS.includes(observed.variant)) return;
  const extra = await variantRuntime.executeVariantActions({ variant: observed.variant, observed, input, options });
  for (const action of extra) {
    if (!plan.actions.some((item) => item.type === action.type && actionScope(item) === actionScope(action))) {
      plan.actions.push(action);
    }
  }
}

function actionScope(action) {
  return action.patchId || action.patch?.patchId || action.demeId || action.corridorId
    || action.propaguleId || action.propagule?.propaguleId || action.cultureId || action.culture?.id || '';
}

function planFirebreakFeatures(context) {
  context.plan.actions.push(...planFirebreakRecovery(context.observed, context.input));
}

async function planPopulationFeatures(context) {
  const { plan, observed, input, options } = context;
  if (observed.variant === 'classic_patch') await planClassicPatch(context);
  if (observed.variant === 'source_sink') planSourceSink(context);
  if (observed.variant === 'heterogeneous_islands') planHeterogeneity(plan, observed);
  if (observed.variant === 'rescue_network') planRescueNetwork(context);
  if (observed.variant === 'stepping_stone') await planSteppingStone(context);
  if (observed.variant === 'evolutionary') planEvolutionaryCycle({ plan, observed, input });
  if (observed.variantPolicy?.localEvolution === true) appendRequests(plan, input.evolutionRequests, 'EVOLVE_ISLAND');
}

function planSearchFeatures(context) {
  if (context.observed.variant === 'island_search') appendRequests(context.plan, context.input.islandSearchRequests, 'SEARCH_ISLAND');
}

function appendRequests(plan, requests = [], type) {
  for (const request of requests) plan.actions.push({ type, request });
}

function planSourceSink(context) {
  sourceExhaustionRecommendations(context);
  disconnectedSinkRecommendations(context);
}

function sourceExhaustionRecommendations(context) {
  const { plan, observed, input } = context;
  const sourceIds = (observed.contribution?.demes || []).filter((deme) => deme.type === 'SOURCE').map((deme) => deme.demeId);
  for (const demeId of sourceIds) addSourceCapacityRecommendation({ plan, observed, input, demeId });
}

function addSourceCapacityRecommendation(context) {
  const { plan, observed, input, demeId } = context;
  const source = observed.demes.find((deme) => deme.demeId === demeId);
  if (!source) return;
  const capacity = Number(input.sourceCapacityByDeme?.[demeId] ?? source.capacity ?? source.budget?.migrationCapacity);
  const load = Number(input.sourceLoadByDeme?.[demeId] ?? source.migrationLoad ?? 0);
  const utilization = capacity > 0 ? load / capacity : 0;
  if (utilization >= Number(input.sourceCapacityWarningRatio || 0.8)) {
    plan.recommendations.push({ type: 'SOURCE_EXHAUSTION_RISK', demeId: source.demeId, utilization });
  }
}

function disconnectedSinkRecommendations({ plan, observed }) {
  const sourceIds = new Set((observed.contribution?.demes || []).filter((deme) => deme.type === 'SOURCE').map((deme) => deme.demeId));
  for (const sink of (observed.contribution?.demes || []).filter((deme) => deme.type === 'SINK')) {
    const supplied = observed.corridors.some((edge) => edge.enabled && edge.capacity > 0
      && edge.targetDemeId === sink.demeId && sourceIds.has(edge.sourceDemeId));
    if (!supplied) plan.recommendations.push({ type: 'SINK_WITHOUT_CAPACITY_AWARE_SOURCE', demeId: sink.demeId });
  }
}

function planHeterogeneity(plan, observed) {
  const active = observed.demes.filter((deme) => deme.status === 'ACTIVE');
  if (active.length < 2) return;
  const providers = new Set(active.map((deme) => deme.providerId).filter(Boolean)).size;
  const algorithms = new Set(active.map((deme) => deme.algorithmId).filter(Boolean)).size;
  const lineages = new Set(active.flatMap((deme) => deme.lineage?.founders || []).filter(Boolean)).size;
  plan.recommendations.push({ type: 'HETEROGENEITY_FLOOR', activeDemes: active.length,
    providers, algorithms, lineages, belowFloor: providers < 2 || algorithms < 2 || lineages < 2 });
}

function planRescueNetwork(context) {
  const { plan, observed, input } = context;
  const atRisk = observed.demes.filter((deme) => ['AT_RISK', 'STRESSED'].includes(deme.status));
  for (const deme of atRisk) planRescueTarget({ plan, observed, input, deme });
}

function planRescueTarget(context) {
  const { plan, observed, input, deme } = context;
  const sources = observed.demes.filter((source) => source.status === 'ACTIVE'
      && observed.corridors.some((edge) => edge.enabled && edge.capacity > 0
        && edge.sourceDemeId === source.demeId && edge.targetDemeId === deme.demeId));
  const slaMs = Number(input.recoverySLA?.maxResponseTimeMs || observed.variantPolicy?.recoverySlaMs || 300000);
  const waitMs = Number(input.waitTimeMs || 0);
  plan.recommendations.push({ type: waitMs > slaMs ? 'RESCUE_SLA_BREACH' : 'RESCUE_NETWORK_READY',
    demeId: deme.demeId, sourceDemeIds: sources.map((source) => source.demeId), waitMs, slaMs });
}

function planSteppingStone(context) {
  const { plan, observed, input } = context;
  const demes = observed.demes.filter((d) => ['ACTIVE', 'STRESSED'].includes(d.status));
  if (demes.length < 2) return;
  const corridors = observed.corridors.filter((c) => c.enabled);
  addLocalityRecommendations({ plan, demes, corridors, input });
  addBridgeExtinctionRecommendations({ plan, demes, observed, corridors });
}

function addLocalityRecommendations(context) {
  const { plan, demes, corridors, input } = context;
  if (input.enforceLocality === false) return;
  for (const deme of demes) {
    const neighbors = getSteppingStoneNeighbors(deme.demeId, corridors);
    const nonNeighbors = demes.filter((item) => item.demeId !== deme.demeId && !neighbors.includes(item.demeId));
    if (nonNeighbors.length) plan.recommendations.push({ type: 'LOCALITY_CONSTRAINT_VIOLATION',
      demeId: deme.demeId, nonNeighbors: nonNeighbors.map((item) => item.demeId) });
  }
}

function addBridgeExtinctionRecommendations(context) {
  const { plan, demes, observed, corridors } = context;
  const bridgeDemes = demes.filter((d) => getSteppingStoneNeighbors(d.demeId, corridors).length >= 2);
  for (const bridge of bridgeDemes) {
    const neighbors = getSteppingStoneNeighbors(bridge.demeId, corridors);
    const neighborStatuses = neighbors.map((nId) => observed.demes.find((d) => d.demeId === nId)?.status);
    const allNeighborsCollapsed = neighborStatuses.every((s) => s === 'COLLAPSED');
    if (allNeighborsCollapsed && neighbors.length > 0) {
      plan.recommendations.push({ type: 'BRIDGE_EXTINCTION_REWIRE_REQUIRED', demeId: bridge.demeId, neighbors: neighborStatuses });
    }
  }
}

function getSteppingStoneNeighbors(demeId, corridors) {
  const outgoing = corridors.filter((c) => c.sourceDemeId === demeId && c.enabled);
  const incoming = corridors.filter((c) => c.targetDemeId === demeId && c.enabled);
  return [...new Set([...outgoing.map((c) => c.targetDemeId), ...incoming.map((c) => c.sourceDemeId)])];
}

async function planClassicPatch(context) {
  const collapsed = context.observed.demes.filter((item) => item.status === 'COLLAPSED');
  for (const deme of collapsed) await planPatchTrial({ ...context, deme });
}

async function planPatchTrial(context) {
  const { plan, observed, input, options, deme } = context;
  const patch = observed.patches.find((item) => item.patchId === deme.patchId);
  if (!patch) return;
  if (patch.status === 'OCCUPIED' && deme.status === 'COLLAPSED') {
    plan.actions.push({ type: 'VACATE_COLLAPSED_PATCH', patchId: patch.patchId });
    return;
  }
  if (!['VACANT', 'AVAILABLE'].includes(patch.status)) return;
  const pending = await context.options.db.get(`SELECT colonization_id FROM metapopulation_colonizations
    WHERE metapopulation_id = ? AND patch_id = ? AND status IN ('IN_TRIAL', 'COMPLETING')`, input.metapopulationId, patch.patchId);
  if (pending) {
    plan.recommendations.push({ type: 'RECOLONIZATION_TRIAL_PENDING', patchId: patch.patchId, colonizationId: pending.colonization_id });
    return;
  }
  const candidates = founderCandidates(deme, observed.demes, input);
  if (candidates.length < 2) return;
  const proposal = await recolonization.planRecolonization({ metapopulationId: input.metapopulationId,
    candidateLineages: candidates, founderLimit: input.founderLimit }, options);
  appendFounderTrial(plan, patch.patchId, proposal);
}

function founderCandidates(deme, demes, input) {
  return input.candidateLineages || demes.filter((item) => item.status === 'ACTIVE' && item.demeId !== deme.demeId)
    .map((item) => ({ lineageId: item.lineage?.founders?.[0] || item.demeId,
      patchIds: [deme.patchId], sourceDemeId: item.demeId }));
}

function appendFounderTrial(plan, patchId, proposal) {
  const match = proposal.patches.find((item) => item.patchId === patchId && item.founders.length >= proposal.minimumLineages);
  if (match) plan.actions.push({ type: 'START_RECOLONIZATION_TRIAL', patchId, founders: match.founders });
}

function planEvolutionaryCycle(context) {
  const { plan, observed, input } = context;
  const cycleInterval = Number(input.evolutionIntervalMs || observed.variantPolicy?.evolutionIntervalMs || 60000);
  for (const deme of observed.demes.filter((d) => d.status === 'ACTIVE' && d.population && d.population.length > 0)) {
    plan.actions.push({ type: 'EVOLVE_ISLAND', demeId: deme.demeId,
      request: evolutionRequest({ input, deme }),
      interval: cycleInterval, cycle: 'evolutionary' });
  }
}

function evolutionRequest(context) {
  const { input, deme } = context;
  return { demeId: deme.demeId, population: deme.population, generation: deme.generation || 0,
    fitnessContext: deme.fitnessContext || {}, missionId: input.metapopulationId };
}

async function planTopologyChange(context) {
  const { plan, observed, input, options } = context;
  const policy = observed.variantPolicy || {};
  if (shouldInitializeTopology(observed, policy)) return plan.actions.push({ type: 'APPLY_VARIANT_TOPOLOGY' });
  if (!shouldReconcileTopology(observed, policy)) return;
  const proposed = await corridors.planTopology(input.metapopulationId, { ...options, candidateEdges: observed.corridors });
  if (!sameCorridorPairs(observed.corridors, proposed)) plan.actions.push({
    type: 'REWIRE_VARIANT_TOPOLOGY', corridors: proposed
  });
}

function shouldInitializeTopology(observed, policy) {
  return observed.corridors.length === 0 && observed.demes.length > 1 && Boolean(policy.corridorTopology);
}

function shouldReconcileTopology(observed, policy) {
  return Boolean(policy.directedMigration || policy.ephemeral) && observed.corridors.length > 0;
}

function sameCorridorPairs(current, proposed) {
  const keys = (items) => items.map((item) => `${item.sourceDemeId}->${item.targetDemeId}:${item.capacity}:${item.enabled}`).sort();
  return JSON.stringify(keys(current)) === JSON.stringify(keys(proposed));
}

function planEphemeralPatches(plan, observed, input) {
  planDiscoveredPatches(plan, observed, input);
  planPresentEphemeralPatches(plan, observed, input);
}

function planDiscoveredPatches(plan, observed, input) {
  const known = new Set(observed.patches.map((patch) => patch.patchId));
  for (const patch of input.discoveredPatches || []) {
    if (!patch?.patchId || known.has(patch.patchId)) continue;
    plan.actions.push({ type: 'DISCOVER_EPHEMERAL_PATCH', patch: ephemeralPatchInput(patch, input) });
    known.add(patch.patchId);
  }
}

function planPresentEphemeralPatches(plan, observed, input) {
  if (!Array.isArray(input.presentPatchIds)) return;
  const present = new Set(input.presentPatchIds);
  planReboundPatches(plan, observed, present);
  planExpiredPatches(plan, observed, present);
}

function planReboundPatches(plan, observed, present) {
  for (const patch of observed.patches.filter((item) => isEphemeral(item) && present.has(item.patchId) && item.status === 'UNAVAILABLE')) {
    plan.actions.push({ type: 'REBIND_EPHEMERAL_PATCH', patchId: patch.patchId });
    const dormant = observed.demes.find((deme) => deme.patchId === patch.patchId && deme.status === 'DORMANT');
    if (dormant) plan.actions.push({ type: 'ACTIVATE_EPHEMERAL_DEME', demeId: dormant.demeId });
  }
}

function planExpiredPatches(plan, observed, present) {
  const expiring = observed.patches.filter((patch) => isEphemeral(patch) && !present.has(patch.patchId)
    && ['AVAILABLE', 'VACANT', 'OCCUPIED'].includes(patch.status));
  for (const patch of expiring) planExpirePatch(plan, observed, patch);
}

function planExpirePatch(plan, observed, patch) {
  for (const deme of observed.demes.filter((item) => item.patchId === patch.patchId && ['ACTIVE', 'STRESSED'].includes(item.status))) {
    plan.actions.push({ type: 'DORMANT_EPHEMERAL_DEME', demeId: deme.demeId });
  }
  plan.actions.push({ type: 'EXPIRE_EPHEMERAL_PATCH', patchId: patch.patchId });
}

function ephemeralPatchInput(patch, input) {
  return { ...patch, environment: { ...patch.environment, runtime: {
    ...(patch.environment?.runtime || {}), ephemeral: true,
    leaseExpiresAt: patch.leaseExpiresAt || input.patchLeaseExpiresAt || null
  } } };
}

function isEphemeral(patch) { return patch.environment?.runtime?.ephemeral === true; }

function planFirebreakRecovery(observed, input) {
  if (observed.variantPolicy?.firebreaks !== true) return [];
  const policy = observed.variantPolicy;
  const now = input.now ? Date.parse(input.now) : Date.now();
  const measured = new Map((observed.synchrony.allPairs || []).flatMap((pair) => [
    [pair.pairId, pair.risk], [`${pair.targetDemeId}->${pair.sourceDemeId}`, pair.risk]
  ]));
  const pairs = observed.corridors.filter((edge) => !edge.enabled && edge.homogenizationRisk >= observed.synchrony.threshold)
    .flatMap((edge) => recoverPair({ edge, measured, policy, now }));
  return pairs.length ? [{ type: 'RECOVER_FIREBREAKS', pairs }] : [];
}

function recoverPair(context) {
  const { edge, measured, policy, now } = context;
  const risk = measured.get(`${edge.sourceDemeId}->${edge.targetDemeId}`);
  const elapsed = now - Date.parse(edge.updatedAt || '');
  return Number.isFinite(risk) && risk <= policy.firebreakRecoveryThreshold && elapsed >= policy.firebreakDurationMs
    ? [{ sourceDemeId: edge.sourceDemeId, targetDemeId: edge.targetDemeId, risk }] : [];
}

async function executeVariantAction(action, context) {
  return variantActionExecutors.executeVariantAction(action, context);
}

async function verifyVariantActions(context) {
  return variantActionVerifiers.verifyVariantActions(context);
}

async function verifyTopologyActions(context) {
  return variantActionVerifiers.verifyTopologyActions(context);
}

async function verifyFirebreakActions(context) {
  return variantActionVerifiers.verifyFirebreakActions(context);
}

module.exports = { planVariantActions, executeVariantAction, verifyVariantActions, verifyTopologyActions, verifyFirebreakActions };
