'use strict';

const { normalizeCapabilityNeed } = require('../contracts/capabilityNeed');
const scoring = require('./routeScoringService');
const articulationPoints = require('../analytics/articulationPointService');

function activeNodes(session, policy) {
  return (session.nodes || []).filter((node) => ['ACTIVE', 'AVAILABLE'].includes(node.state)
    && node.availability?.status !== 'UNAVAILABLE'
    && (!policy.privateOnly || isPrivateNode(node)));
}

function isPrivateNode(node) {
  return String(node.localContext?.classification || node.localContext?.confidentiality || '').toUpperCase() === 'PRIVATE';
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
  const topology = topologyStats(input.session, nodes, policy);
  const lineageEdgeIds = lineageEdgeSet(input.session);
  return paths.map((path) => routeCandidate({ path, byId, need, policy, topology, lineageEdgeIds }))
    .filter(Boolean).sort((left, right) => right.utility - left.utility || left.routeId.localeCompare(right.routeId));
}

function lineageEdgeSet(session) {
  if (!session.routeLineage || !session.routeLineage.length) return null;
  const set = new Set();
  for (const entry of session.routeLineage) {
    if (Array.isArray(entry.edgeIds)) entry.edgeIds.forEach((id) => set.add(id));
  }
  return set.size ? set : null;
}

function routeCandidate(input) {
  const { path, byId, need, policy, topology, lineageEdgeIds } = input;
  const provider = byId.get(path.nodeIds[path.nodeIds.length - 1]);
  if (!provider || !pathAllowed({ path, byId, need, policy, provider })) return null;
  const bonus = (policy.preferShortPaths ? 1 / (1 + path.edges.length) : 0) + hubBonus(path, topology);
  return {
    routeId: `route:${need.needId}:${path.edges.map((edge) => edge.edgeId).join('/') || provider.nodeId}`,
    needId: need.needId, capability: need.capability, nodeIds: path.nodeIds,
    edgeIds: path.edges.map((edge) => edge.edgeId), failureDomains: routeFailureDomains(path, byId),
    utility: routeUtility({ path, provider, policy, bonus, lineageEdgeIds }),
    cost: path.edges.reduce((sum, edge) => sum + edge.cost, provider.cost),
    latency: path.edges.reduce((sum, edge) => sum + edge.latency, provider.latency),
    reliability: path.edges.reduce((value, edge) => value * edge.reliability, provider.reliability),
    evidenceRequirements: [...need.evidenceRequirements]
  };
}

function pathAllowed(input) {
  const { path, byId, need, policy, provider } = input;
  const bridge = path.nodeIds.some((nodeId) => byId.get(nodeId)?.localContext?.bridgeId);
  return (!policy.requireBridge || bridge) && provider.capabilities.includes(need.capability)
    && scoring.constraintsSatisfied(path, need, provider) && privacySatisfied({ path, byId, need, policy });
}

function routeUtility(input) {
  const { path, provider, policy, bonus, lineageEdgeIds } = input;
  const utility = policy.objectiveWeights || policy.curiosityWeight
    ? scoring.objectiveScore(path, provider, { weights: { ...(policy.objectiveWeights || {}), curiosity: policy.curiosityWeight }, now: policy.now, lineageEdgeIds })
    : scoring.routeScore(path, provider);
  return utility + bonus;
}

function topologyStats(session, nodes, policy) {
  if (!policy.hubWeight) return null;
  const degree = new Map(nodes.map((node) => [node.nodeId, 0]));
  for (const edge of session.edges || []) {
    if (edge.status !== 'ACTIVE') continue;
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  }
  return { degree, maximum: Math.max(1, ...degree.values()), articulation: new Set(articulationPoints.articulationPoints(session)), policy };
}

function hubBonus(path, stats) {
  if (!stats || path.nodeIds.length < 3) return 0;
  const interior = path.nodeIds.slice(1, -1);
  const scores = interior.map((nodeId) => (stats.degree.get(nodeId) / stats.maximum)
    - (stats.policy.penalizeArticulationHubs && stats.articulation.has(nodeId) ? 0.5 : 0));
  return stats.policy.hubWeight * scores.reduce((total, value) => total + value, 0) / scores.length;
}

function privacySatisfied(input) {
  const { path, byId, need, policy } = input;
  const nodes = path.nodeIds.map((nodeId) => byId.get(nodeId));
  const required = { ANY: 0, PUBLIC: 0, INTERNAL: 1, RESTRICTED: 2 }[need.constraints.privacy] || 0;
  if (nodes.some((node) => classification(node) < required)) return false;
  if (need.constraints.locality !== 'ANY' && nodes.some((node) => node.localContext.locality !== need.constraints.locality)) return false;
  if (need.constraints.tools.length && !nodes.some((node) => node.providers.some((provider) => need.constraints.tools.includes(provider.providerId)))) return false;
  return !policy.enforceTrustDomains || validTrustBoundary(nodes);
}

function classification(node) {
  const value = String(node.localContext.classification || node.localContext.confidentiality || 'PUBLIC').toUpperCase();
  return { PUBLIC: 0, INTERNAL: 1, RESTRICTED: 2, PRIVATE: 3 }[value] ?? 0;
}

function validTrustBoundary(nodes) {
  const domains = new Set(nodes.map((node) => node.localContext.trustDomain).filter(Boolean));
  if (domains.size <= 1) return nodes.length === 1 || nodes.every((node) => node.localContext.trustDomain);
  return nodes.every((node) => {
    const evidenceId = node.localContext.boundaryProof?.evidenceId;
    return node.localContext.boundaryProof?.verified === true && evidenceId
      && node.provenance.includes(`admission:${evidenceId}`);
  });
}

function chooseAlternatives(candidates, policy, limit) {
  if (!policy.edgeDisjointAlternatives) return candidates.slice(0, limit);
  const selected = [];
  const usedEdges = new Set();
  const usedDomains = new Set();
  for (const candidate of candidates) {
    const domains = candidate.failureDomains || [];
    if (candidate.edgeIds.some((edgeId) => usedEdges.has(edgeId))
      || policy.failureDomainDisjoint && domains.some((domain) => usedDomains.has(domain))) continue;
    selected.push(candidate);
    candidate.edgeIds.forEach((edgeId) => usedEdges.add(edgeId));
    domains.forEach((domain) => usedDomains.add(domain));
    if (selected.length === limit) break;
  }
  return selected;
}

function routeFailureDomains(path, byId) {
  return path.nodeIds.slice(1, -1).map((nodeId) => {
    const node = byId.get(nodeId);
    return node.localContext.failureDomain || node.nodeId;
  });
}

function plan(session, value, policy = {}) {
  const need = normalizeCapabilityNeed(value);
  const nodes = activeNodes(session, policy);
  const activeIds = new Set(nodes.map((node) => node.nodeId));
  const configuredHops = Number(policy.maxHops) || activeIds.size;
  const paths = findPaths({ session, starts: startNodeIds(session, nodes), activeIds, maxHops: configuredHops, onWork: policy.onWork });
  const candidates = buildAlternatives({ paths, nodes, need, policy });
  const limit = Number.isInteger(policy.alternatives) ? Math.max(1, policy.alternatives) : candidates.length;
  const alternatives = chooseAlternatives(candidates, policy, limit);
  if (!alternatives.length) return { needId: need.needId, capability: need.capability, selected: false, verdict: 'unreachable', alternatives: [] };
  return { needId: need.needId, capability: need.capability, selected: true, verdict: 'route_selected', route: alternatives[0], alternatives };
}

module.exports = { plan };
