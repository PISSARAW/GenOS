'use strict';

const { createMorphologyEdge } = require('../graph/morphologyEdge');
const { validateMorphologyGraph } = require('../graph/morphologyGraphValidator');
const { FIREWALL_CONTROLS, findFirewall } = require('./firewallTypes');

function createFirewallEdge(input = {}) {
  const controls = Array.isArray(input.controls) ? [...new Set(input.controls)] : [];
  if (!controls.length || controls.some((control) => !FIREWALL_CONTROLS.includes(control))) {
    throw new Error('firewall must declare at least one supported control');
  }
  return createMorphologyEdge({
    type: 'FIREWALL',
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    properties: {
      controls,
      mode: input.mode || 'deny_by_default',
      redactsTo: input.redactsTo || null,
      allowedActions: Array.isArray(input.allowedActions) ? [...input.allowedActions] : []
    }
  });
}

function attachFirewall(graph, input) {
  const edge = createFirewallEdge(input);
  const updated = { ...graph, edges: [...(graph.edges || []), edge] };
  const validation = validateMorphologyGraph(updated);
  if (!validation.valid) throw new Error(`Invalid firewall attachment: ${validation.errors.join('; ')}`);
  return updated;
}

function hasFirewall(graph, endpoints, control) {
  return Boolean(findFirewall(graph, endpoints, control));
}

module.exports = { attachFirewall, createFirewallEdge, hasFirewall };
