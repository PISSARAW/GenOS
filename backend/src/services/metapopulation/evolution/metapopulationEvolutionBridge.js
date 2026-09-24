'use strict';

const procedural = require('../../proceduralMetapopulationService');

async function evolveIsland(input = {}, options = {}) {
  if (typeof options.rustEvolution !== 'function') {
    throw Object.assign(new Error('The Rust multi-island evolution adapter is not configured.'), { code: 'METAPOPULATION_RUST_ADAPTER_UNAVAILABLE' });
  }
  const request = toRustRequest(input);
  const report = await options.rustEvolution(request);
  return validateRustReport(report, input.demeId);
}

function toRustRequest(input) {
  if (!input.demeId || !Array.isArray(input.population)) {
    throw Object.assign(new Error('A deme and its local population are required.'), { code: 'METAPOPULATION_EVOLUTION_INPUT_INVALID' });
  }
  return { islandName: input.demeId, individuals: input.population,
    generation: Number(input.generation || 0), seed: input.seed, fitnessContext: input.fitnessContext || {} };
}

function validateRustReport(report, demeId) {
  if (!report || report.islandName !== demeId || !Number.isSafeInteger(report.generation) ||
      !Number.isFinite(report.bestFitness) || !Number.isFinite(report.meanFitness)) {
    throw Object.assign(new Error('Rust evolution adapter returned an invalid report.'), { code: 'METAPOPULATION_RUST_REPORT_INVALID' });
  }
  return { engine: 'rust-multi-island', demeId, generation: report.generation,
    bestFitness: report.bestFitness, meanFitness: report.meanFitness,
    verifiedCount: Number.isSafeInteger(report.verifiedCount) ? report.verifiedCount : 0,
    rejectedCount: Number.isSafeInteger(report.rejectedCount) ? report.rejectedCount : 0 };
}

function synchronizeProceduralPopulation(input = {}) {
  let state = procedural.metapopulation({ id: input.id, populations: input.populations, collapsed: input.collapsed });
  for (const population of input.additions || []) state = procedural.addPopulation(state, population);
  for (const popId of input.extinctions || []) state = procedural.markCollapsed(state, popId);
  for (const population of input.recolonizations || []) state = procedural.recolonize(state, population);
  return { state, diversity: procedural.totalDiversity(state), engine: 'procedural-metapopulation' };
}

module.exports = { evolveIsland, synchronizeProceduralPopulation, toRustRequest, validateRustReport };
