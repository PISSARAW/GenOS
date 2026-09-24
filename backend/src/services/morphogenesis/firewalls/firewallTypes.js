'use strict';

const FIREWALL_CONTROLS = Object.freeze(['INDEPENDENCE', 'STATE', 'PRIVACY', 'AUTHORITY']);

function controlsFirewall(edge, control) {
  return edge && edge.type === 'FIREWALL'
    && Array.isArray(edge.properties && edge.properties.controls)
    && edge.properties.controls.includes(control);
}

function findFirewall(graph, endpoints, control) {
  return (graph.edges || []).find((candidate) => (
    candidate.type === 'FIREWALL'
    && candidate.fromNodeId === endpoints.fromNodeId
    && candidate.toNodeId === endpoints.toNodeId
    && controlsFirewall(candidate, control)
  )) || null;
}

module.exports = { FIREWALL_CONTROLS, controlsFirewall, findFirewall };
