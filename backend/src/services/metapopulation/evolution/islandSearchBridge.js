'use strict';

const { createHash } = require('crypto');

async function searchIsland(input = {}, options = {}) {
  if (typeof options.solverSearch !== 'function') throw searchError('METAPOPULATION_SOLVER_ADAPTER_UNAVAILABLE');
  const request = normalizedRequest(input);
  return validateSearchResult(await options.solverSearch(request), request);
}

function normalizedRequest(input) {
  if (!input.demeId || !input.solverId || !input.problemRef) throw searchError('METAPOPULATION_SEARCH_INPUT_INVALID');
  return { ...input, seed: input.seed ?? deterministicSeed(input), stateIsolation: 'ISLAND_LOCAL' };
}

function deterministicSeed(input) {
  const key = `${input.missionId || ''}:${input.demeId}:${input.generation || 0}:${input.solverId}`;
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function validateSearchResult(result, request) {
  if (!result || result.solverId !== request.solverId || !Number.isFinite(result.objective)
    || typeof result.incumbentRef !== 'string' || !Array.isArray(result.counterexampleRefs)
    || !Number.isSafeInteger(result.iterations) || result.iterations < 0) {
    throw searchError('METAPOPULATION_SEARCH_RESULT_INVALID');
  }
  return { engine: 'island-search-adapter', demeId: request.demeId, solverId: request.solverId,
    seed: request.seed, objective: result.objective, incumbentRef: result.incumbentRef,
    counterexampleRefs: result.counterexampleRefs, iterations: result.iterations };
}

function searchError(code) { return Object.assign(new Error(code), { code }); }

module.exports = { searchIsland, normalizedRequest, deterministicSeed, validateSearchResult };
