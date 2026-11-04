'use strict';

const { loadMeshContext, meshError } = require('./adaptiveMeshContext');
const { profileAudience, groundingForAudience } = require('./relationshipCommunicationRoutingService');
const { applyTopologyConstraints } = require('./communicationDecisionContext');
const { intentFingerprint, planFingerprint } = require('./adaptiveMeshFingerprint');

const LEVELS = ['none', 'transport_ack', 'semantic_ack', 'action_ack', 'verified_ack', 'human_confirmation'];

function sameSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const values = new Set(left);
  return values.size === new Set(right).size && right.every(value => values.has(value));
}

function assertPlan(input, audit) {
  if (intentFingerprint(input.intent) !== audit.intentFingerprint) throw meshError('MESH_INTENT_CHANGED');
  if (planFingerprint(input.decision, audit) !== audit.planFingerprint) throw meshError('MESH_PLAN_MISMATCH');
  if (!sameSet(input.decision.recipients, audit.proposedRecipients)) throw meshError('MESH_PLAN_MISMATCH');
  const refs = new Set(input.intent.semanticRefs || []);
  if (!Array.isArray(audit.semanticRefs) || !audit.semanticRefs.every(ref => refs.has(ref))) {
    throw meshError('MESH_PLAN_MISMATCH');
  }
}

function assertContext(context, audit) {
  if (context.excluded.length > 0) throw meshError('MESH_DELIVERY_SCOPE_CHANGED');
  if (context.missionId !== audit.missionId || context.owner !== audit.orchestratorId) {
    throw meshError('MESH_DELIVERY_SCOPE_CHANGED');
  }
  for (const key of ['organizationId', 'projectId']) {
    if (context.scope[key] !== audit.scope?.[key]) throw meshError('MESH_DELIVERY_SCOPE_CHANGED');
  }
  if (context.state.organization !== audit.organization || context.state.version !== audit.organizationVersion) {
    throw meshError('MESH_DELIVERY_TOPOLOGY_CHANGED');
  }
}

async function assertRelationships(input, context) {
  const candidates = context.allowed.map(agentId => ({ agentId, unknownRefs: [], score: 0 }));
  const eligible = await profileAudience({ db: input.db, intent: input.intent,
    candidates, ...context.scope });
  if (eligible.length !== candidates.length) throw meshError('MESH_DELIVERY_RELATION_CHANGED');
  const grounding = groundingForAudience(input.intent, eligible);
  if (LEVELS.indexOf(grounding) > LEVELS.indexOf(input.decision.grounding)) {
    throw meshError('MESH_DELIVERY_GROUNDING_CHANGED');
  }
}

function assertTopology(decision, context) {
  const topology = { policy: context.state.policy, variantId: context.state.policy.variantId || null };
  if (!applyTopologyConstraints({ topology }, decision, decision.action).allowed) {
    throw meshError('MESH_DELIVERY_TOPOLOGY_CHANGED');
  }
}

async function validateMeshDelivery(input) {
  const audit = input.decision.meta?.adaptiveMesh;
  if (audit?.mode !== 'active' || audit.status !== 'applied') return { valid: true };
  try {
    assertPlan(input, audit);
    const db = input.db || await require('../../db').getDatabase();
    const context = await loadMeshContext({ ...input, db });
    assertContext(context, audit);
    assertTopology(input.decision, context);
    await assertRelationships({ ...input, db }, context);
    return { valid: true };
  } catch (error) {
    const reason = error.code?.startsWith('MESH_') ? error.code : 'MESH_REVALIDATION_UNAVAILABLE';
    return { valid: false, reason };
  }
}

module.exports = { validateMeshDelivery };
