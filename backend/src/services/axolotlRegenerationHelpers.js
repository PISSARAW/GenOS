'use strict';

const { hash, error, clone } = require('./axolotlStateStore');

function validateGraph(topology) {
  const nodes = topology?.components;
  const edges = topology?.connections;
  validateShape(nodes, edges);
  const ids = validateComponents(nodes);
  if (edges.some((edge) => !ids.has(edge.from) || !ids.has(edge.to) || !validName(edge.type))) throw error('REGENERATION_CONNECTION_INVALID');
  return topology;
}


function validateShape(nodes, edges) {
  if (!Array.isArray(nodes) || !nodes.length || nodes.length > 256) throw error('REGENERATION_TOPOLOGY_INVALID');
  if (!Array.isArray(edges) || edges.length > 4096) throw error('REGENERATION_TOPOLOGY_INVALID');
}
function validateComponents(nodes) {
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length || nodes.some((node) => !validName(node.id) || !validName(node.role))) throw error('REGENERATION_COMPONENT_INVALID');
  return ids;
}
function validName(value) { return typeof value === 'string' && /^[\w.-]{1,160}$/.test(value); }

function normalizeScope(scope, topology) {
  const requested = scope || { type: 'global' };
  if (!['global', 'components', 'roles'].includes(requested.type)) throw error('REGENERATION_SCOPE_INVALID');
  if (requested.type === 'global') return { type: 'global', componentIds: topology.components.map((node) => node.id) };
  const field = requested.type === 'roles' ? 'role' : 'id';
  const identifiers = requested.type === 'roles' ? requested.roles : requested.componentIds;
  if (!Array.isArray(identifiers) || !identifiers.length || !identifiers.every((id) => topology.components.some((node) => node[field] === id))) throw error('REGENERATION_SCOPE_INVALID');
  return { type: requested.type, componentIds: topology.components.filter((node) => identifiers.includes(node[field])).map((node) => node.id) };
}

function buildScopedTopology(session) {
  const original = clone(session.currentTopology);
  const affected = new Set(session.scope.componentIds);
  const ids = new Map([...affected].map((id, index) => [id, `${session.id.slice(-12)}_${index}`]));
  const components = original.components.map((node) => affected.has(node.id)
    ? { ...node, id: ids.get(node.id), originId: node.originId || node.id, regeneratedFrom: node.id, status: 'active', generation: (node.generation || 0) + 1 }
    : node);
  const connections = original.connections.map((edge) => ({ ...edge, from: ids.get(edge.from) || edge.from, to: ids.get(edge.to) || edge.to }));
  addRecoveryEdges({ components, connections, affectedIds: new Set(ids.values()) });
  repairContractRoutes({ topology: { components, connections }, contract: session.functionalContract, bridgeId: ids.values().next().value });
  return validateGraph({ ...original, structure: 'functional_regenerated', components, connections,
    knowledge: original.knowledge || {}, regenerated: true, scope: clone(session.scope) });
}

function addRecoveryEdges({ components, connections, affectedIds }) {
  const first = components.find((node) => affectedIds.has(node.id));
  const last = components.filter((node) => affectedIds.has(node.id)).at(-1);
  if (!connections.some((edge) => edge.from === last.id && edge.to === first.id && edge.type === 'feedback')) connections.push({ from: last.id, to: first.id, type: 'feedback' });
  for (let index = 1; index < components.length; index++) {
    const current = components[index];
    const previous = components[index - 1];
    if (affectedIds.has(current.id) && affectedIds.has(previous.id)) connections.push({ from: previous.id, to: current.id, type: 'recovery_route' });
  }
}

function repairContractRoutes({ topology, contract, bridgeId }) {
  for (const probe of contract.probes.filter((item) => item.kind === 'route')) {
    const from = findComponent(topology, probe.from);
    const to = findComponent(topology, probe.to);
    if (!from || !to) continue;
    if (reachable(topology, { from: from.id, to: to.id })) continue;
    if (from.id !== bridgeId) topology.connections.push({ from: from.id, to: bridgeId, type: 'recovery_route' });
    if (to.id !== bridgeId) topology.connections.push({ from: bridgeId, to: to.id, type: 'recovery_route' });
  }
}
function findComponent(topology, id) {
  return topology.components.find((node) => node.id === id || node.regeneratedFrom === id || node.originId === id);
}

function reachable(topology, route) {
  const queue = [route.from];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (id === route.to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of topology.connections.filter((item) => item.from === id)) queue.push(edge.to);
  }
  return false;
}

function checkConnectivity(topology) {
  try { validateGraph(topology); } catch (_) { return false; }
  const undirected = { ...topology, connections: topology.connections.flatMap((edge) => [edge, { from: edge.to, to: edge.from }]) };
  return topology.components.every((node) => reachable(undirected, { from: topology.components[0].id, to: node.id }));
}

function validateFunctionalEquivalence(topology, contract = {}) {
  let valid = true;
  try { validateGraph(topology); } catch (_) { valid = false; }
  const checks = [
    { name: 'graph_integrity', passed: valid },
    { name: 'connected', passed: valid && checkConnectivity(topology) },
    { name: 'roles', passed: (contract.requiredRoles || []).every((role) => topology?.components?.some((node) => node.role === role)) }
  ];
  return { passed: checks.every((check) => check.passed), checks, structuralOnly: true };
}

function topologySignature(topology) { return hash(topology); }
function compareTopologyAlternatives(topology) {
  validateGraph(topology);
  return [{ id: 'functional_regenerated', signature: 'functional_regenerated', suitability: 'high', description: 'Remplacement des composants ciblés et nouvelles boucles de récupération.' }];
}
function selectTargetStructure(topology, alternatives) { return alternatives[0] || compareTopologyAlternatives(topology)[0]; }
function buildRegenerationPath(topology, target, preserved) {
  return ['preserve', 'build', 'experiment', 'validate', 'adopt'].map((phase, index) => ({ phase, order: index + 1, target: target.id, preserved }));
}

module.exports = { validateGraph, normalizeScope, buildScopedTopology, reachable, checkConnectivity, validateFunctionalEquivalence,
  topologySignature, compareTopologyAlternatives, selectTargetStructure, buildRegenerationPath };
