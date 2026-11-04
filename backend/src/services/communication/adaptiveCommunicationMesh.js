'use strict';

const { loadMeshContext, meshError } = require('./adaptiveMeshContext');
const { planMesh } = require('./adaptiveMeshPlanner');
const { applyTopologyConstraints } = require('./communicationDecisionContext');
const { estimateCost } = require('./communicationCostService');
const { validateMeshDelivery } = require('./adaptiveMeshDeliveryGuard');
const { intentFingerprint, planFingerprint } = require('./adaptiveMeshFingerprint');

const SCHEMA_VERSION = 'genos.adaptive-communication-mesh/v1';
const MODES = new Set(['off', 'shadow', 'active']);

function configuration(options = {}) {
  const mode = options.mode ?? process.env.GENOS_COMMUNICATION_MESH_MODE ?? 'shadow';
  if (!MODES.has(mode)) throw meshError('MESH_MODE_INVALID');
  const maxFanout = options.maxFanout ?? 3;
  if (!Number.isInteger(maxFanout) || maxFanout < 1 || maxFanout > 8) throw meshError('MESH_FANOUT_INVALID');
  return { mode, maxFanout };
}

function auditOf(config, decision) {
  return { schemaVersion: SCHEMA_VERSION, ...config, status: 'skipped',
    adaptation: 'context_adaptive', learning: 'none',
    proposedRecipients: [], semanticRefs: [], excluded: [],
    originalRecipientCount: decision.recipients?.length || 0,
    selectedRecipientCount: 0, reasonCodes: [], edges: [],
    costStatus: 'conservative_policy_estimate', tokenSavingsVerified: false };
}

function annotate(decision, audit) {
  return { ...decision, meta: { ...decision.meta, adaptiveMesh: audit } };
}

function silence(decision, audit) {
  return annotate({ ...decision, action: 'SILENCE', scope: 'SELF', recipients: [],
    grounding: 'none', ttlMs: 0,
    reasonCodes: [...new Set([...(decision.reasonCodes || []), ...audit.reasonCodes])],
    meta: { ...decision.meta, groups: [], relationshipRouting: [], cost: 0, utility: 0,
      rejectedAction: decision.action } }, audit);
}

function filteredGroups(decision, plan) {
  const recipients = new Set(plan.recipients);
  const refs = new Set(plan.semanticRefs);
  return (decision.meta?.groups || []).map(group => ({ ...group,
    members: group.members.filter(id => recipients.has(id)),
    unknownRefs: group.unknownRefs.filter(ref => refs.has(ref)) }))
    .filter(group => group.members.length > 0);
}

function groundingCost(grounding) {
  return estimateCost({ grounding, recipientCount: 0, encoding: 'semantic-fingerprint' }).breakdown.grounding;
}

function costMeta(decision, plan) {
  const meta = decision.meta || {};
  const increase = Math.max(0, groundingCost(plan.grounding) - groundingCost(decision.grounding));
  if (increase === 0 || !Number.isFinite(meta.cost)) return {};
  return { cost: meta.cost + increase,
    utility: Number.isFinite(meta.utility) ? meta.utility - increase : meta.utility,
    breakdown: { ...meta.breakdown, grounding: groundingCost(plan.grounding) } };
}

function applyPlan(decision, plan, audit) {
  if (plan.recipients.length === 0) return silence(decision, audit);
  const adjustedCost = costMeta(decision, plan);
  const scope = plan.protected ? decision.scope : plan.recipients.length === 1 ? 'UNICAST' : 'SELECTIVE_MULTICAST';
  const final = { ...decision, recipients: plan.recipients, scope, grounding: plan.grounding,
    reasonCodes: [...new Set([...(decision.reasonCodes || []), ...audit.reasonCodes])],
    meta: { ...decision.meta, ...adjustedCost, groups: filteredGroups(decision, plan),
      relationshipRouting: (decision.meta?.relationshipRouting || [])
        .filter(profile => plan.recipients.includes(profile.agentId)) } };
  return annotate(final, { ...audit, planFingerprint: planFingerprint(final, audit) });
}

function populateAudit(audit, plan, context) {
  return { ...audit, status: 'applied', missionId: context.missionId, scope: context.scope,
    orchestratorId: context.owner,
    intentFingerprint: intentFingerprint(context.intent),
    organization: context.state.organization, organizationVersion: context.state.version,
    protected: plan.protected, proposedRecipients: plan.recipients,
    semanticRefs: plan.semanticRefs, excluded: plan.excluded, edges: plan.edges,
    selectedRecipientCount: plan.recipients.length,
    reasonCodes: [plan.protected ? 'MESH_OBLIGATIONS_PRESERVED' : 'MESH_SELECTIVE_ROUTING'] };
}

function knownFailure(error) {
  return typeof error.code === 'string' && error.code.startsWith('MESH_');
}

function blockedAudit(audit, error) {
  return { ...audit, status: 'blocked', proposedRecipients: [], semanticRefs: [], edges: [],
    selectedRecipientCount: 0, reasonCodes: [knownFailure(error) ? error.code : 'MESH_CONTEXT_UNAVAILABLE'] };
}

function skipsMesh(decision) {
  return decision.action === 'SILENCE' || decision.action === 'STIGMERGY';
}

function checkTopology(decision, plan, context) {
  const candidate = { ...decision, recipients: plan.recipients,
    scope: plan.protected ? decision.scope : plan.recipients.length === 1 ? 'UNICAST' : 'SELECTIVE_MULTICAST' };
  const topology = { policy: context.state.policy, variantId: context.state.policy.variantId || null };
  const gate = applyTopologyConstraints({ topology }, candidate, decision.action);
  if (!gate.allowed) throw meshError(`MESH_${gate.reasonCode}`);
}

function planDenial(decision, plan) {
  if (plan.protected && plan.excluded.length > 0) return 'MESH_REQUIRED_RECIPIENT_DENIED';
  const adjusted = costMeta(decision, plan);
  if (!plan.protected && Number.isFinite(adjusted.utility) && adjusted.utility <= 0) {
    return 'MESH_NON_POSITIVE_UTILITY';
  }
  return null;
}

async function meshDecision(input, audit) {
  const context = await loadMeshContext(input);
  const plan = await planMesh(input, context, audit.maxFanout);
  checkTopology(input.decision, plan, context);
  const nextAudit = populateAudit(audit, plan, context);
  const denial = planDenial(input.decision, plan);
  if (denial) {
    nextAudit.status = 'blocked';
    nextAudit.reasonCodes = [denial];
  }
  if (plan.recipients.length === 0) nextAudit.reasonCodes.push('MESH_NO_RECIPIENTS');
  if (audit.mode === 'shadow') {
    const status = nextAudit.status === 'applied' ? 'proposed' : nextAudit.status;
    return annotate(input.decision, { ...nextAudit, status });
  }
  if (nextAudit.status === 'blocked') return silence(input.decision, nextAudit);
  return applyPlan(input.decision, plan, nextAudit);
}

async function applyAdaptiveMesh(input) {
  const config = configuration(input.options);
  if (config.mode === 'off') return input.decision;
  const audit = auditOf(config, input.decision);
  if (skipsMesh(input.decision)) return annotate(input.decision, audit);
  try {
    const db = input.db || await require('../../db').getDatabase();
    return await meshDecision({ ...input, db }, audit);
  } catch (error) {
    const blocked = blockedAudit(audit, error);
    return config.mode === 'shadow' ? annotate(input.decision, blocked) : silence(input.decision, blocked);
  }
}

module.exports = { SCHEMA_VERSION, applyAdaptiveMesh, validateMeshDelivery };
