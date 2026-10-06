'use strict';

const populationRuntime = require('../populations/populationRuntimeService');
const populationService = require('../populations/populationService');
const { assessIndividual } = require('../niches/agentNicheService');
const capacity = require('../resources/ecologicalCapacityService');
const { RESOURCE_KEYS } = require('../constants');
const { retain } = require('./ecologicalArchive');
const trails = require('../environmentalMemory/environmentalTrailStore');

async function colonize(ecology, candidates, actions) {
  const known = new Set(ecology.populations.flatMap(p => p.individuals.map(i => i.individualId)));
  for (const individual of candidates.filter(i => !known.has(i.individualId))) {
    const assessment = assessIndividual(individual, ecology.niches);
    const niche = ecology.niches.find(n => assessment.realizedNicheId === n.nicheId);
    if (!niche) continue;
    let population = ecology.populations.find(p => p.nicheId === niche.nicheId && p.status !== 'extinct');
    if (!population) {
      const created = await populationRuntime.execute(ecology, { type: 'create',
        population: { populationId: `population:${niche.nicheId}`, nicheId: niche.nicheId } });
      population = created.population;
      actions.push(created.action);
    }
    const spawned = await populationRuntime.execute(ecology, { type: 'spawn',
      populationId: population.populationId, individuals: [individual] });
    actions.push(spawned.action);
    known.add(individual.individualId);
  }
}

function recordResults(session, results, actions) {
  const ecology = session.ecology;
  const runtime = ecology.ecologicalState.runtime;
  for (const result of results) {
    if (runtime.resultIds.includes(result.id)) continue;
    const population = ecology.populations.find(p => p.populationId === result.populationId);
    recordOne(session, population, result);
    runtime.resultIds = [...runtime.resultIds, result.id];
    actions.push({ type: 'POPULATION_RESULT_MEASURED', status: 'applied', resultId: result.id });
  }
}

function recordOne(session, population, result) {
    const ecology = session.ecology;
    validateResult(population, result);
    consume(ecology, population, result);
    const productivity = result.productivity;
    const next = populationService.advance(population, { productivity });
    next.marginalProductivity = result.marginalProductivity ?? productivity;
    next.individuals = next.individuals.map(i => withFitness(i, result));
    ecology.populations = ecology.populations.map(p => p.populationId === next.populationId ? next : p);
    ecology.niches = ecology.niches.map(n => n.nicheId === next.nicheId
      ? { ...n, productivity, informationGain: result.informationGain ?? n.informationGain } : n);
    depositResult(session, next, result);
    require('./ecologicalSignals').record(session, next, result);
}

function depositResult(session, next, result) {
  const ecology = session.ecology;
  const productivity = result.productivity;
    retain(ecology, { id: result.id, nicheId: next.nicheId, populationId: next.populationId,
      quality: productivity, novelty: result.novelty ?? 0, robustness: result.robustness ?? 0,
      cost: result.resources?.tokens ?? 0, evidenceRefs: result.evidenceRefs,
      artifact: result.artifact || null, individuals: next.individuals });
    trails.deposit(session.matrix, { key: `result:${result.id}`, location: next.patchId || next.nicheId,
      sourcePopulation: next.populationId, yield: productivity, evidenceRefs: result.evidenceRefs,
      attractant: productivity > 0 ? 1 : 0, repellent: productivity > 0 ? 0 : 1 });
}

function validateResult(population, result) {
  const measured = Number.isFinite(result.productivity) && result.productivity >= 0;
  const evidence = Array.isArray(result.evidenceRefs) && result.evidenceRefs.length > 0;
  if (!population || typeof result.id !== 'string' || !result.id || !measured || !evidence) {
    throw Object.assign(new Error('A population result requires identity, measured productivity and evidence.'), {
      code: 'BIOME_RESULT_INVALID'
    });
  }
}

function consume(ecology, population, result) {
  const runtime = ecology.ecologicalState.runtime;
  const resources = require('../contracts/resourceVector').createResourceVector(result.resources);
  const nextUsed = runtime.budgetUsed + resources.tokens;
  if (runtime.budgetTotal !== undefined && nextUsed > runtime.budgetTotal) {
    throw Object.assign(new Error('Population consumption exceeds the mission budget.'), { code: 'BIOME_BUDGET_EXCEEDED' });
  }
  for (const key of RESOURCE_KEYS) {
    if (resources[key] > population.resourcePool[key]) {
      throw Object.assign(new Error(`Insufficient population resource '${key}'.`), { code: 'BIOME_RESOURCE_INSUFFICIENT' });
    }
  }
  for (const key of RESOURCE_KEYS) population.resourcePool[key] -= resources[key];
  runtime.budgetUsed = nextUsed;
}

function withFitness(individual, result) {
  if (result.individualId && result.individualId !== individual.individualId) return individual;
  const receipt = { score: result.productivity, nicheId: individual.realizedNicheId,
    evidenceRefs: result.evidenceRefs, resultId: result.id };
  return { ...individual, fitnessReceipts: [...individual.fitnessReceipts, receipt].slice(-100) };
}

function reclaim(ecology) {
  for (const population of ecology.populations) {
    for (const key of RESOURCE_KEYS) {
      ecology.resourcePool[key] = (ecology.resourcePool[key] || 0) + population.resourcePool[key];
      population.resourcePool[key] = 0;
    }
  }
}

async function regulate(ecology, input, context) {
  regulateCompatibility(ecology, context.actions);
  const assessment = capacity.assessAndApply(ecology, { measurements: input.capacityMeasurements,
    garageCapacity: input.garageCapacity, thresholds: input.capacityThresholds });
  context.actions.push(assessment.action);
  for (const niche of ecology.niches) {
    const members = ecology.populations.filter(p => p.nicheId === niche.nicheId);
    let remaining = niche.carryingCapacity;
    for (const population of members) {
      const count = Math.min(remaining, population.individuals.length);
      remaining = Math.max(0, remaining - count);
      if (count < population.individuals.length) await shrink(ecology, population, { count, actions: context.actions });
    }
  }
}

function regulateCompatibility(ecology, actions) {
  for (const population of ecology.populations) {
    const niche = ecology.niches.find(n => n.nicheId === population.nicheId);
    const incompatible = population.individuals.filter(i => !assessIndividual(i, [niche]).fundamentalNicheIds.includes(population.nicheId));
    if (!incompatible.length) continue;
    population.individuals = population.individuals.filter(i => !incompatible.includes(i));
    if (!population.individuals.length) population.status = 'dormant';
    const archive = ecology.ecologicalState.dormantIndividuals || [];
    ecology.ecologicalState.dormantIndividuals = [...archive, ...incompatible.map(individual => ({
      nicheId: population.nicheId, populationId: population.populationId, individual
    }))].slice(-500);
    actions.push({ type: 'INCOMPATIBLE_INDIVIDUALS_ARCHIVED', status: 'applied', populationId: population.populationId });
  }
  ecology.niches = ecology.niches.map(n => ({ ...n, occupancy: ecology.populations.filter(p => p.nicheId === n.nicheId)
    .reduce((sum, p) => sum + p.individuals.length, 0) }));
}

async function shrink(ecology, population, context) {
  const archived = structuredClone(population.individuals);
  const result = await populationRuntime.execute(ecology, { type: 'select',
    populationId: population.populationId, count: context.count });
  if (context.count === 0) {
    ecology.populations = ecology.populations.map(p => p.populationId === population.populationId ? { ...p, status: 'dormant' } : p);
  }
  const removed = archived.filter(i => !result.population.individuals.some(j => j.individualId === i.individualId));
  ecology.ecologicalState.dormantIndividuals = [...(ecology.ecologicalState.dormantIndividuals || []),
    ...removed.map(individual => ({ nicheId: population.nicheId, populationId: population.populationId, individual }))].slice(-500);
  context.actions.push(result.action);
}

module.exports = { colonize, recordResults, reclaim, regulate };
