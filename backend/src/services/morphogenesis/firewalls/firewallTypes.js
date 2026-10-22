'use strict';

const FIREWALL_CONTROLS = Object.freeze(['INDEPENDENCE', 'STATE', 'PRIVACY', 'AUTHORITY']);

// Politique par défaut des pare-feux informationnels : STRICT.
// Posture fail-closed : tout ce qui n'est pas explicitement autorisé est bloqué.
// Aligné sur docs/02-orchestration/topologies/morphogenese.md §12 et §17.4.
const DEFAULT_FIREWALL_POLICY = 'STRICT';

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

module.exports = { FIREWALL_CONTROLS, DEFAULT_FIREWALL_POLICY, controlsFirewall, findFirewall };
