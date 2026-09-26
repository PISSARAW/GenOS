'use strict';

const recolonizationService = require('../patches/recolonizationService');
const rescueNetworkRuntime = require('../runtime/rescueNetworkRuntimeService');

async function classicPatchActions(observed, input, options) {
  const actions = [];
  const extinctDemes = observed.demes.filter((deme) => deme.status === 'COLLAPSED');
  for (const deme of extinctDemes) {
    const trial = await planDemeTrial({ observed, input, options, deme });
    if (trial) actions.push(trial);
  }
  return actions;
}

async function planDemeTrial(context) {
  const { observed, input, options, deme } = context;
  const patch = observed.patches.find((p) => p.patchId === deme.patchId);
  if (!patch || !['VACANT', 'AVAILABLE'].includes(patch.status)) return null;
  if (await hasPendingTrial(input.metapopulationId, patch.patchId, options)) return null;
  const candidateLineages = founderLineages({ observed, input, deme, patch });
  if (candidateLineages.length < 2) return null;
  const candidates = await recolonizationService.planRecolonization({
    metapopulationId: input.metapopulationId,
    candidateLineages,
    founderLimit: input.founderLimit
  }, options);
  const match = candidates.patches.find((p) => p.patchId === patch.patchId && p.founders.length >= candidates.minimumLineages);
  return match ? { type: 'START_RECOLONIZATION_TRIAL', patchId: match.patchId, founders: match.founders } : null;
}

function founderLineages(context) {
  const { observed, input, deme, patch } = context;
  return input.candidateLineages || observed.demes
    .filter((d) => d.status === 'ACTIVE' && d.demeId !== deme.demeId)
    .map((d) => ({ lineageId: d.lineage?.founders?.[0] || d.demeId, patchIds: [patch.patchId], sourceDemeId: d.demeId }));
}

async function hasPendingTrial(metapopulationId, patchId, options) {
  if (!options.db || !metapopulationId || !patchId) return false;
  try {
    const pending = await options.db.get(`SELECT colonization_id FROM metapopulation_colonizations
      WHERE metapopulation_id = ? AND patch_id = ? AND status IN ('IN_TRIAL', 'COMPLETING')`, metapopulationId, patchId);
    return Boolean(pending);
  } catch (_) {
    return false;
  }
}

async function rescueNetworkActions(observed, input, options) {
  return [
    ...slaBreachActions(observed, input),
    ...reserveCorridorActions(observed, input),
    ...founderDeployActions(input),
    ...founderReserveActions(observed, input)
  ];
}

function slaBreachActions(observed, input) {
  const sla = observed.variantPolicy?.recoverySlaMs;
  const atRiskDemes = observed.demes.filter((d) => d.status === 'AT_RISK');
  return atRiskDemes.filter((deme) => slaBreached(deme, sla))
    .map((deme) => ({ type: 'RECOVERY_SLA_BREACH', demeId: deme.demeId, slaMs: sla }));
}

function slaBreached(deme, sla) {
  const updated = Date.parse(deme.updatedAt || '');
  return Number.isFinite(sla) && Number.isFinite(updated) && Date.now() - updated > sla;
}

function reserveCorridorActions(observed, input) {
  if (observed.variantPolicy?.rescuePriority !== 'at-risk') return [];
  return observed.corridors.filter((c) => c.isReserve === true)
    .map((corridor) => ({ type: 'ACTIVATE_RESERVE_CORRIDOR', corridorId: corridor.corridorId }));
}

function founderDeployActions(input) {
  return (input.prePositionedFounders || [])
    .map((founder) => ({ type: 'DEPLOY_FOUNDER', demeId: founder.targetDemeId, lineage: founder.lineage }));
}

function founderReserveActions(observed, input) {
  if (!Number.isFinite(observed.variantPolicy?.founderReserveSize)) return [];
  const reserve = rescueNetworkRuntime.maintainFounderReserve(observed.demes,
    { desiredSize: observed.variantPolicy.founderReserveSize, staged: input.stagedFounders });
  return reserve.needsStaging
    ? [{ type: 'STAGE_FOUNDER_RESERVE', deficit: reserve.deficit, atRiskCount: reserve.atRiskCount }]
    : [];
}

async function ephemeralPatchActions(observed, input, options) {
  const actions = [];
  const known = new Set(observed.patches.map((patch) => patch.patchId));
  for (const patch of input.discoveredPatches || []) {
    if (patch?.patchId && !known.has(patch.patchId)) {
      actions.push({ type: 'DISCOVER_EPHEMERAL_PATCH', patch: ephemeralPatchInput(patch, input) });
      known.add(patch.patchId);
    }
  }
  if (!Array.isArray(input.presentPatchIds)) return actions;
  return [...actions, ...rebindActions(observed, input), ...expiryActions(observed, input)];
}

function rebindActions(observed, input) {
  const present = new Set(input.presentPatchIds);
  return observed.patches
    .filter((item) => isEphemeralPatch(item) && present.has(item.patchId) && item.status === 'UNAVAILABLE')
    .map((patch) => ({ type: 'REBIND_EPHEMERAL_PATCH', patchId: patch.patchId }));
}

function expiryActions(observed, input) {
  const present = new Set(input.presentPatchIds);
  const expiring = observed.patches.filter((item) => isEphemeralPatch(item) && !present.has(item.patchId)
    && ['AVAILABLE', 'VACANT'].includes(item.status));
  return expiring.flatMap((patch) => expirePatchActions(observed, patch));
}

function expirePatchActions(observed, patch) {
  const dormant = observed.demes
    .filter((item) => item.patchId === patch.patchId && ['ACTIVE', 'STRESSED'].includes(item.status))
    .map((deme) => ({ type: 'DORMANT_EPHEMERAL_DEME', demeId: deme.demeId }));
  return [...dormant, { type: 'EXPIRE_EPHEMERAL_PATCH', patchId: patch.patchId }];
}

function ephemeralPatchInput(patch, input) {
  const runtime = { ...(patch.environment?.runtime || {}), ephemeral: true, leaseExpiresAt: patch.leaseExpiresAt || input.patchLeaseExpiresAt || null };
  return { ...patch, environment: { ...patch.environment, runtime } };
}

function isEphemeralPatch(patch) { return patch.environment?.runtime?.ephemeral === true; }

async function persistentActions(observed, input, options) {
  return [
    ...residentDaemonActions(observed),
    ...regionalMemoryActions(observed),
    ...interMissionActions(input)
  ];
}

function residentDaemonActions(observed) {
  if (observed.variantPolicy?.persistResidents !== true) return [];
  return observed.demes.filter((d) => d.status === 'ACTIVE' && d.isResident === true)
    .map((deme) => ({ type: 'MAINTAIN_RESIDENT_DAEMON', demeId: deme.demeId }));
}

function regionalMemoryActions(observed) {
  if (observed.variantPolicy?.retainRegionalMemory !== true) return [];
  const decayRate = observed.variantPolicy.memoryDecayRate || 0.01;
  const actions = [];
  for (const deme of observed.demes.filter((d) => d.status === 'ACTIVE')) {
    const agedMemory = ageMemory(deme.localMemoryRef, decayRate);
    if (agedMemory !== deme.localMemoryRef) {
      actions.push({ type: 'UPDATE_DEME_MEMORY', demeId: deme.demeId, memoryRef: agedMemory });
    }
  }
  return actions;
}

function interMissionActions(input) {
  return (input.interMissionMigrations || []).map((migration) => ({ type: 'INTER_MISSION_MIGRATION', ...migration }));
}

function ageMemory(memoryRef, decayRate) {
  if (!memoryRef || typeof memoryRef !== 'string') return memoryRef;
  return `${memoryRef}::decayed-${decayRate}-${Date.now()}`;
}

module.exports = { classicPatchActions, rescueNetworkActions, ephemeralPatchActions, persistentActions, hasPendingTrial };
