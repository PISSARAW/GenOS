'use strict';

const { normalizeCapabilityNeed } = require('../contracts/capabilityNeed');
const scoring = require('./routeScoringService');

function activeNodes(session, policy) {
  return (session.nodes || []).filter((node) => ['ACTIVE', 'AVAILABLE'].includes(node.state)
    && node.availability?.status !== 'UNAVAILABLE'
    && (!policy.privateOnly || node.localContext?.confidentiality === 'PRIVATE'));
}

function startNodeIds(session, nodes) {
  const ids = new Set(nodes.map((node) => node.nodeId));
  const holders = (session.coordinationLoci || []).map((item) => item.holderNodeId).filter((id) => ids.has(id));
  if (holders.length) return holders;
  const roots = nodes.filter((node) => !(session.edges || []).some((edge) => edge.to === node.nodeId && edge.status === 'ACTIVE')).map((node) => node.nodeId);
  return roots.length ? roots : nodes.map((node) => node.nodeId);
}

function expandState(state, edges, activeIds) {
  return edges.filter((edge) => edge.from === state.nodeIds[state.nodeIds.length - 1]
    && edge.status === 'ACTIVE' && activeIds.has(edge.to) && !state.nodeIds.includes(edge.to))
    .map((edge) => ({ nodeIds: [...state.nodeIds, edge.to], edges: [...state.edges, edge] }));
}

function findPaths(input) {
  const pending = input.starts.map((nodeId) => ({ nodeIds: [nodeId], edges: [] }));
  const found = [];
  const maxHops = Math.min(input.activeIds.size, input.maxHops);
  while (pending.length) {
    const current = pending.shift();
    found.push(current);
    input.onWork?.((input.session.edges || []).length || 1);
    if (current.edges.length < maxHops) pending.push(...expandState(current, input.session.edges || [], input.activeIds));
  }
  return found;
}

function buildAlternatives(input) {
  const { paths, nodes, need, policy } = input;
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  return paths.flatMap((path) => {
    const provider = byId.get(path.nodeIds[path.nodeIds.length - 1]);
    const crossesBridge = path.nodeIds.some((nodeId) => byId.get(nodeId)?.localContext?.bridgeId);
    if (policy.requireBridge && !crossesBridge) return [];
    if (!provider.capabilities.includes(need.capability) || !scoring.constraintsSatisfied(path, need, provider)) return [];
    const shortPathBonus = policy.preferShortPaths ? 1 / (1 + path.edges.length) : 0;
    return [{
      routeId: `route:${need.needId}:${path.edges.map((edge) => edge.edgeId).join('/') || provider.nodeId}`,
      needId: need.needId,
      capability: need.capability,
      nodeIds: path.nodeIds,
      edgeIds: path.edges.map((edge) => edge.edgeId),
      utility: scoring.routeScore(path, provider) + shortPathBonus,
      cost: path.edges.reduce((sum, edge) => sum + edge.cost, provider.cost),
      latency: path.edges.reduce((sum, edge) => sum + edge.latency, provider.latency),
      reliability: path.edges.reduce((value, edge) => value * edge.reliability, provider.reliability),
      evidenceRequirements: [...need.evidenceRequirements]
    }];
  }).sort((left, right) => right.utility - left.utility || left.routeId.localeCompare(right.routeId));
}

function plan(session, value, policy = {}) {
  const need = normalizeCapabilityNeed(value);
  const nodes = activeNodes(session, policy);
  const activeIds = new Set(nodes.map((node) => node.nodeId));
  const configuredHops = Number(policy.maxHops) || activeIds.size;
  const paths = findPaths({ session, starts: startNodeIds(session, nodes), activeIds, maxHops: configuredHops, onWork: policy.onWork });
  const alternatives = buildAlternatives({ paths, nodes, need, policy });
  if (!alternatives.length) return { needId: need.needId, capability: need.capability, selected: false, verdict: 'unreachable', alternatives: [] };
  return { needId: need.needId, capability: need.capability, selected: true, verdict: 'route_selected', route: alternatives[0], alternatives };
}

module.exports = { plan };
