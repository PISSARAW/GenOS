'use strict';

function vectorDecisionSummary(pareto) {
  if (!pareto) return null;
  return {
    outcome: pareto.outcome,
    reason: pareto.reason || null,
    dimensions: pareto.dimensions || [],
    thresholds: pareto.thresholds || null,
    frontier: (pareto.frontier || []).map((world) => world.worldNumber),
    worlds: (pareto.worlds || []).map((world) => ({
      worldNumber: world.worldNumber,
      vector: world.vector,
      missing: world.missing,
      gateFailures: world.gateFailures || []
    }))
  };
}

module.exports = { vectorDecisionSummary };
