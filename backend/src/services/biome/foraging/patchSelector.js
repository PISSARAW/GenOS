'use strict';

const { SearchPatchService } = require('../../search/searchPatchService');
const semanticDistance = require('./semanticDistanceService');

function selectAlternative(input = {}) {
  const search = new SearchPatchService({ envMeanReturnRate: input.environmentThreshold });
  const alternatives = Array.isArray(input.alternatives) ? input.alternatives : [];
  const candidates = alternatives.map((patch) => scorePatch({ ...input, patch, search })).filter((patch) => patch.available);
  return candidates.sort((left, right) => right.netReturn - left.netReturn || left.patchId.localeCompare(right.patchId))[0] || null;
}

function scorePatch({ currentPatchId, currentDescriptor, elapsedTimeSec, occupancyByPatch = {}, patch, search }) {
  const patchId = String(patch.patchId || '').trim();
  if (!patchId || patchId === currentPatchId) return { available: false };
  const evaluation = evaluateSearchPatch({ patchId, patch, elapsedTimeSec, search });
  const metrics = returnMetrics({ currentDescriptor, occupancyByPatch, patch, evaluation });
  return { patchId, ...metrics, available: patchAvailable(patch, metrics.parallelOccupancy),
    descriptor: patch.descriptor || '', operation: patch.operation || null };
}

function evaluateSearchPatch({ patchId, patch, elapsedTimeSec, search }) {
  const searchPatch = search.createPatch(patchId, patch.type || 'ecological');
  searchPatch.history = Array.isArray(patch.history) ? patch.history : [];
  return search.evaluatePatch(patchId, elapsedTimeSec);
}

function returnMetrics({ currentDescriptor, occupancyByPatch, patch, evaluation }) {
  const expectedReturn = finite(patch.expectedReturn, evaluation?.marginalYield || 0);
  const distance = semanticDistance.semanticDistance(currentDescriptor, patch.descriptor);
  const uncertainty = bounded(patch.uncertainty);
  const risk = bounded(patch.risk);
  const occupancy = parallelPressure(patch, occupancyByPatch);
  const informationValue = Math.max(0, finite(patch.expectedInformationGain, 0)) * (1 + distance);
  const adjustedReturn = expectedReturn + informationValue
    - uncertainty * Math.max(0, finite(patch.uncertaintyCost, 1))
    - risk * Math.max(0, finite(patch.riskCost, 1))
    - occupancy * Math.max(0, finite(patch.congestionCost, 1));
  const switchCost = Math.max(0, finite(patch.switchCost, finite(patch.defaultSwitchCost, 0)));
  return { expectedReturn, informationValue, uncertainty, risk, parallelOccupancy: occupancy,
    semanticDistance: distance, adjustedReturn, switchCost, netReturn: adjustedReturn - switchCost };
}

function patchAvailable(patch, occupancy) {
  const hasCapacity = patch.parallelCapacity === undefined || (patch.parallelCapacity > 0 && occupancy < 1);
  return patch.available !== false && hasCapacity;
}

function parallelPressure(patch, occupancyByPatch) {
  if (Number.isFinite(patch.parallelOccupancy)) return bounded(patch.parallelOccupancy);
  const occupancy = finite(patch.occupancy, occupancyByPatch[patch.patchId] || 0);
  if (Number.isFinite(patch.parallelCapacity)) return patch.parallelCapacity > 0 ? bounded(occupancy / patch.parallelCapacity) : (occupancy ? 1 : 0);
  return bounded(occupancy);
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function bounded(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

module.exports = { selectAlternative, scorePatch };
