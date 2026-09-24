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
  return session.edges.filter((edge) => edge.status === 'ACTIVE' && isIdle(edge, now, maxIdleMs))
    .map((edge) => proposal(session, edge, { now, maxIdleMs, threshold }));
}

function proposal(session, edge, context) {
  const safety = structuralGate.assess(session, edge);
  const lowUtility = utility(edge) < context.threshold;
  const action = dispositionService.decide({ lowUtility, idle: isIdle(edge, context.now, context.maxIdleMs), structurallyCritical: !safety.safe, securityRisk: edge.status === 'QUARANTINED' });
  return { edgeId: edge.edgeId, action, utility: utility(edge), safety, fossil: action === 'FOSSILIZE' ? fossilService.create(session, edge) : null };
}

module.exports = { propose };
