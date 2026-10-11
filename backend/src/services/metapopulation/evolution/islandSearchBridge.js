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
  if (!matchesRequest(result, request) || !validPayload(result)) {
    throw searchError('METAPOPULATION_SEARCH_RESULT_INVALID');
  }
  return { engine: 'island-search-adapter', demeId: request.demeId, solverId: request.solverId,
    problemRef: request.problemRef, seed: request.seed, objective: result.objective,
    incumbentRef: result.incumbentRef, evidenceRef: result.evidenceRef,
    provenance: result.provenance, counterexampleRefs: result.counterexampleRefs,
    iterations: result.iterations };
}

function matchesRequest(result, request) {
  return result?.solverId === request.solverId && result.demeId === request.demeId
    && result.problemRef === request.problemRef && result.seed === request.seed;
}

function validPayload(result) {
  return Number.isFinite(result.objective) && nonEmptyString(result.incumbentRef)
    && nonEmptyString(result.evidenceRef) && isRecord(result.provenance)
    && Array.isArray(result.counterexampleRefs)
    && Number.isSafeInteger(result.iterations) && result.iterations >= 0;
}

function isRecord(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function nonEmptyString(value) { return typeof value === 'string' && Boolean(value.trim()); }
function searchError(code) { return Object.assign(new Error(code), { code }); }

module.exports = { searchIsland, normalizedRequest, deterministicSeed, validateSearchResult };
