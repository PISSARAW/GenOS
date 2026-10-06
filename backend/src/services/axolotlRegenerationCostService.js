'use strict';
const MEASURED_UNITS = Object.freeze(['tokens', 'events', 'durationMs', 'costUsd', 'componentsChanged', 'connectionsChanged']);
function accumulate(previous, observed) {
  const cost = { ...(previous || {}), source: 'runtime_observation' };
  for (const unit of MEASURED_UNITS) {
    const value = observed?.[unit];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) cost[unit] = (cost[unit] || 0) + value;
  }
  return cost;
}
function changes(before, after) {
  const oldNodes = new Set((before?.components || []).map((item) => JSON.stringify(item)));
  const newNodes = new Set((after?.components || []).map((item) => JSON.stringify(item)));
  const oldEdges = new Set((before?.connections || []).map((item) => JSON.stringify(item)));
  const newEdges = new Set((after?.connections || []).map((item) => JSON.stringify(item)));
  return { componentsChanged: difference(oldNodes, newNodes), connectionsChanged: difference(oldEdges, newEdges) };
}
function difference(before, after) {
  let count = 0;
  for (const value of before) if (!after.has(value)) count += 1;
  for (const value of after) if (!before.has(value)) count += 1;
  return count;
}
function average(values) { return values.reduce((sum, item) => sum + item, 0) / values.length; }
function compareObservations(observations) {
  const stable = observations.filter((item) => item.mode === 'stabilisé');
  const plastic = observations.filter((item) => item.mode === 'plastique');
  if (stable.length < 3 || plastic.length < 3) return { status: 'insufficient_observations', stable: stable.length, plastic: plastic.length };
  const contractHashes = new Set(observations.map((item) => item.contractHash));
  if (contractHashes.size !== 1) return { status: 'incomparable_contracts' };
  const stableDurationMs = average(stable.map((item) => item.result.durationMs));
  const plasticDurationMs = average(plastic.map((item) => item.result.durationMs));
  return { status: 'measured', stableSamples: stable.length, plasticSamples: plastic.length,
    stableDurationMs, plasticDurationMs, durationDeltaMs: plasticDurationMs - stableDurationMs,
    source: 'isolated_runtime_observations', inference: 'Ces échantillons mesurent les probes couvertes; ils ne prédisent pas le coût de toutes les missions.' };
}
module.exports = { accumulate, changes, compareObservations, MEASURED_UNITS };