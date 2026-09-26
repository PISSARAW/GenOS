'use strict';

function advance(ecology, state, input) {
  const evidenceRefs = strings(input.evidenceRefs);
  const failedIds = strings(input.failedPopulationIds);
  const reserve = ecology.ecologicalState.recoveryBudgetReserve ?? ecology.ecologicalState.recoveryReserve ?? {};
  const reserveTokens = typeof reserve === 'number' ? reserve : Number(reserve.tokens) || 0;
  const refugia = snapshotRefugia(ecology, input.refugiaPopulationIds);
  let reserveUsed = 0;
  let recovered = null;
  if (input.confirmLocalExtinction === true) markExtinct(ecology, failedIds, evidenceRefs);
  const recovery = attemptRecovery({ ecology, input, evidenceRefs, reserve, reserveTokens });
  recovered = recovery.population;
  reserveUsed = recovery.reserveUsed;
  const redundancy = functionalRedundancy(ecology);
  const keystone = keystoneScores(ecology);
  const event = makeEvent({ input, failedIds, refugia, reserveTokens, reserveUsed, recovered, redundancy, keystone, evidenceRefs });
  return { state: { ...state, resilienceEvents: [...(state.resilienceEvents || []), event].slice(-500) },
    decision: event, action: { type: recovered ? 'ECOSYSTEM_RECOLONIZED' : 'DISTURBANCE_ASSESSED', status: 'applied', reserveUsed } };
}

function makeEvent(options) {
  const { input, failedIds, refugia, reserveTokens, reserveUsed, recovered, redundancy, keystone, evidenceRefs } = options;
  return { disturbanceId: input.disturbanceId || null, failedPopulationIds: failedIds,
    confirmedExtinctions: input.confirmLocalExtinction === true ? failedIds : [], refugia, reserveBefore: reserveTokens,
    reserveUsed, recovered: recovered?.populationId || null, functionalRedundancy: redundancy,
    keystoneScores: keystone, evidenceRefs };
}

function attemptRecovery(options) {
  const { ecology, input, evidenceRefs, reserve, reserveTokens } = options;
  const cost = Math.max(0, Number(input.recoveryCost) || 0);
  if (!input.recolonizePopulationId || !evidenceRefs.length || cost > reserveTokens) return { population: null, reserveUsed: 0 };
  const population = recolonize(ecology, { populationId: input.recolonizePopulationId,
    candidates: input.individuals, evidenceRefs });
  ecology.ecologicalState.recoveryBudgetReserve = typeof reserve === 'number'
    ? reserveTokens - cost : { ...reserve, tokens: reserveTokens - cost };
  return { population, reserveUsed: cost };
}

function markExtinct(ecology, ids, evidenceRefs) {
  if (!evidenceRefs.length && ids.length) throw variantError('Extinction confirmation requires evidence.', 'BIOME_VARIANT_EVIDENCE_REQUIRED');
  ecology.populations = ecology.populations.map((population) => ids.includes(population.populationId)
    ? { ...population, status: 'extinct', individuals: [], refugialArchive: population.individuals }
    : population);
}

function recolonize(ecology, options) {
  const { populationId, candidates, evidenceRefs } = options;
  const source = ecology.populations.find((population) => population.populationId === populationId);
  if (!source || source.status !== 'extinct') throw variantError('Recolonization requires an extinct population.', 'BIOME_RECOVERY_SOURCE_INVALID');
  const individuals = Array.isArray(candidates) && candidates.length ? candidates : source.refugialArchive || [];
  if (!individuals.length) throw variantError('Recolonization needs recovered individuals.', 'BIOME_RECOVERY_SOURCE_INVALID');
  const population = { ...source, individuals, status: 'recolonized', recoveryEvidenceRefs: evidenceRefs };
  ecology.populations = ecology.populations.map((item) => item.populationId === populationId ? population : item);
  return population;
}

function snapshotRefugia(ecology, ids) {
  const selected = strings(ids);
  return ecology.populations.filter((population) => !selected.length || selected.includes(population.populationId))
    .map((population) => ({ populationId: population.populationId, nicheId: population.nicheId,
      individuals: population.individuals.map((item) => item.individualId), spores: population.spores.length }));
}

function functionalRedundancy(ecology) {
  return ecology.populations.filter((population) => !['extinct', 'dormant'].includes(population.status))
    .reduce((map, population) => {
      map[population.nicheId] = (map[population.nicheId] || 0) + 1;
      return map;
    }, {});
}

function keystoneScores(ecology) {
  const totals = {};
  for (const link of ecology.interactionGraph) {
    totals[link.sourceId] = (totals[link.sourceId] || 0) + link.strength * link.confidence;
    totals[link.targetId] = (totals[link.targetId] || 0) + link.strength * link.confidence;
  }
  return totals;
}

function strings(value) { return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : []; }
function variantError(message, code) { return Object.assign(new Error(message), { code }); }

module.exports = { advance };
