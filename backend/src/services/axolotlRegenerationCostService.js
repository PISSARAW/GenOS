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

module.exports = { accumulate, MEASURED_UNITS };
