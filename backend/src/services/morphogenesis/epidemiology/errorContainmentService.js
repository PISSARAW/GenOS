'use strict';

function recommendContainment(input = {}) {
  const actions = [];
  if (input.crossedBoundaries) actions.push('reduce_communication', 'add_firewall');
  if (input.contaminatedNodeCount > 1) actions.push('isolate_subtree');
  if (input.unverifiedClaims) actions.push('introduce_verifier');
  return [...new Set(actions)];
}

module.exports = { recommendContainment };
