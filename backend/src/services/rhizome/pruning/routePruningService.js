'use strict';

const structuralGate = require('./structuralSafetyGate');
const dispositionService = require('./branchDispositionService');
const fossilService = require('./routeFossilService');

function isIdle(edge, now, maxIdleMs) {
  if (!edge.lastUsed) return true;
  return now - Date.parse(edge.lastUsed) >= maxIdleMs;
}

function utility(edge) {
  return edge.successRate + edge.evidenceQuality + edge.trailState.positive / 100 - edge.cost / 100;
}

function propose(session, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const maxIdleMs = options.maxIdleMs || 30 * 24 * 60 * 60 * 1000;
  const threshold = Number.isFinite(options.utilityThreshold) ? options.utilityThreshold : 0.2;
  const selectedForDensity = densityEdges(session, options.maxDensity);
  for (const edgeId of budgetEdges(session, options.budgetAware)) selectedForDensity.add(edgeId);
  return session.edges.filter((edge) => edge.status === 'ACTIVE'
    && (isIdle(edge, now, maxIdleMs) || selectedForDensity.has(edge.edgeId)))
    .map((edge) => proposal(session, edge, { now, maxIdleMs, threshold, forceDensity: selectedForDensity.has(edge.edgeId) }));
}

function budgetEdges(session, enabled) {
  if (!enabled) return new Set();
  const budget = session.budgets?.routing ?? session.budgets?.default;
  if (!Number.isFinite(budget)) return new Set();
  const active = session.edges.filter((edge) => edge.status === 'ACTIVE');
  let excessCost = active.reduce((sum, edge) => sum + edge.cost, 0) - budget;
  const selected = new Set();
  const candidates = active.filter((edge) => structuralGate.assess(session, edge).safe)
    .sort((left, right) => right.cost - left.cost || utility(left) - utility(right));
  for (const edge of candidates) {
    if (excessCost <= 0) break;
    selected.add(edge.edgeId);
    excessCost -= edge.cost;
  }
  return selected;
}

function densityEdges(session, maxDensity) {
  if (!Number.isFinite(maxDensity) || maxDensity <= 0) return new Set();
  const active = session.edges.filter((edge) => edge.status === 'ACTIVE');
  const nodeCount = Math.max(2, session.nodes.filter((node) => ['ACTIVE', 'AVAILABLE'].includes(node.state)).length);
  const maxEdges = Math.max(nodeCount - 1, Math.floor(maxDensity * nodeCount * (nodeCount - 1)));
  const excess = Math.max(0, active.length - maxEdges);
  return new Set(active.filter((edge) => structuralGate.assess(session, edge).safe)
    .sort((left, right) => utility(left) - utility(right) || left.edgeId.localeCompare(right.edgeId))
    .slice(0, excess).map((edge) => edge.edgeId));
}

function proposal(session, edge, context) {
  const safety = structuralGate.assess(session, edge);
  const lowUtility = utility(edge) < context.threshold || context.forceDensity;
  const action = dispositionService.decide({ lowUtility, idle: isIdle(edge, context.now, context.maxIdleMs) || context.forceDensity, structurallyCritical: !safety.safe, securityRisk: edge.status === 'QUARANTINED' });
  return { edgeId: edge.edgeId, action, utility: utility(edge), safety, fossil: action === 'FOSSILIZE' ? fossilService.create(session, edge) : null };
}

module.exports = { propose };
