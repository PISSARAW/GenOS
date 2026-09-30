'use strict';

const MEASURED_UNITS = Object.freeze(['tokens', 'events', 'durationMs', 'costUsd', 'componentsChanged', 'connectionsChanged']);

function accumulate(previous, observed) {
  const cost = { ...(previous || {}), source: 'runtime_observation' };
  for (const unit of MEASURED_UNITS) {
    const value = Number(observed?.[unit]);
    if (Number.isFinite(value) && value >= 0) cost[unit] = (Number(cost[unit]) || 0) + value;
  }
  return cost;
}

function changes(before, after) {
  const oldNodes = new Set((before?.components || []).map((item) => `${item.id}:${item.role}`));
  const newNodes = new Set((after?.components || []).map((item) => `${item.id}:${item.role}`));
  const oldEdges = new Set((before?.connections || []).map(edgeKey));
  const newEdges = new Set((after?.connections || []).map(edgeKey));
  return { componentsChanged: difference(oldNodes, newNodes), connectionsChanged: difference(oldEdges, newEdges) };
}

function edgeKey(edge) {
  return `${edge.from}:${edge.to}:${edge.type}`;
}

function difference(before, after) {
  let count = 0;
  for (const value of before) if (!after.has(value)) count += 1;
  for (const value of after) if (!before.has(value)) count += 1;
  return count;
}

module.exports = { accumulate, changes, MEASURED_UNITS };
