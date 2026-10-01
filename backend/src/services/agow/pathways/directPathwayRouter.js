'use strict';

const registry = require('./directPathwayRegistry');
const bus = require('../../signalEventBus');

async function resolveQuery(options) {
  const policy = await require('../agowMechanismPolicyService').load({ agentId: options.agentId, db: options.db });
  if (!['bounded', 'live'].includes(policy.directPathways)) return null;
  return registry.resolve({ agentId: options.agentId, db: options.db, capability: options.capability,
    contextHash: options.contextHash, target: options.target, minimumConfidence: options.minimumConfidence });
}

function publish(options) {
  if (!options.route || options.route.requiresGlobalReview) return { routed: false, reason: 'global_review_required' };
  const event = { signalId: `pathway:${options.route.pathwayId}:${Date.now()}`,
    signalType: 'agow_direct_pathway', semanticType: options.semanticType,
    topic: `agow:pathway:${options.route.target}`, senderAgentId: options.senderAgentId || 'agow',
    recipientAgentIds: [options.route.target], pathwayId: options.route.pathwayId,
    contextHash: options.contextHash, payload: options.payload || null };
  bus.publish(event);
  return { routed: true, pathwayId: options.route.pathwayId, target: options.route.target, signalId: event.signalId };
}

function subscribe(target, handler) {
  if (!target || typeof handler !== 'function') throw new TypeError('Pathway subscriber requires a target and handler.');
  const topic = `agow:pathway:${target}`;
  bus.onTopic(topic, handler);
  return () => bus.removeListener(`topic:${topic}`, handler);
}

async function deliberate(options) {
  const route = await resolveQuery(options);
  if (!route) return { routed: false, reason: 'no_consolidated_pathway' };
  return publish({ ...options, route });
}

async function decompile(options) {
  const route = await registry.suspend({ agentId: options.agentId, db: options.db,
    pathwayId: options.pathwayId, reason: options.reason });
  if (!route) return { decompiled: false, reason: 'pathway_not_found' };
  const candidate = require('../candidates/candidateAdapterService').build({
    module: 'epistemic', agentId: options.agentId, now: Date.now(), observation: {
      candidateId: `decompilation:${route.pathwayId}:${Date.now()}`, semanticType: 'procedural_prediction_error',
      compactPreview: options.reason, evidenceRefs: options.evidenceRefs || [],
      confidence: options.confidence ?? 0.5, predictionError: options.predictionError ?? 1,
      evidenceCoverage: options.evidenceRefs?.length ? 1 : 0, goalMatched: true,
      epistemicOrigin: { origin: 'procedural_generated', realityMode: 'real', agency: 'self' }
    }
  });
  const admission = await workspace.submitCandidate({ candidate, db: options.db, activeGoal: options.activeGoal });
  return { decompiled: true, pathwayId: route.pathwayId, suspensionReason: options.reason, admission };
}

module.exports = { resolveQuery, publish, subscribe, deliberate, decompile };
