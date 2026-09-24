'use strict';

const { measureInterfaceComplexity, clamp } = require('./interfaceComplexityService');

function assessBoundaryRisk(input = {}) {
  const complexity = measureInterfaceComplexity(input);
  const criticality = clamp(Number(input.criticality) || 0, 0, 1);
  const historicalFailures = clamp(Number(input.historicalFailures) || 0, 0, 1);
  const score = clamp(complexity.score * 0.4 + criticality * 0.35 + historicalFailures * 0.25, 0, 1);
  return { score, level: score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low', complexity, criticality, historicalFailures };
}

module.exports = { assessBoundaryRisk };
