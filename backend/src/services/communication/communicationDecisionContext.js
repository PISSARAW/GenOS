'use strict';

const SCHEMA_VERSION = 'genos.communication-decision-context/v1';

function buildDecisionContext(input) {
  if (!input || typeof input !== 'object') throw new Error('Decision context input is required.');
  const { agentId, intent } = input;
  if (!agentId) throw new Error('Decision context agentId is required.');
  if (!intent || typeof intent !== 'object') throw new Error('Decision context intent is required.');
  return {
    schemaVersion: SCHEMA_VERSION,
    topology: topologyOf(input),
    agent: agentOf(input),
    relationships: relationshipList(input.relationships),
    intent: intentOf(intent),
    scope: scopeOf(input.scope),
    budget: budgetOf(input.manifest)
  };
}

function topologyOf(input) {
  const topology = input.topology || input.topologySnapshot || {};
  const policy = input.topologyPolicy || topology.communicationPolicy || null;
  return {
    organization: input.organization || topology.organization || null,
    topologyId: topology.topologyId || null,
    variantId: topology.variantId || input.variantId || null,
    version: Number.isInteger(topology.version) ? topology.version : null,
    policy: policy && typeof policy === 'object' ? { ...policy } : null
  };
}

function agentOf(input) {
  const manifest = input.manifest || {};
  return {
    agentId: input.agentId,
    phenotypeId: manifest.phenotypeId || input.phenotypeId || null,
    allowedChannels: Array.isArray(manifest.allowedChannels) ? [...manifest.allowedChannels] : []
  };
}

function relationshipList(relationships) {
  return Array.isArray(relationships) ? relationships.map((item) => ({ ...item })) : [];
}

function intentOf(intent) {
  return {
    purpose: intent.purpose || null,
    risk: intent.risk || null,
    requiresAction: Boolean(intent.requiresAction),
    objectiveId: intent.objectiveId || null
  };
}

function scopeOf(scope) {
  const value = scope && typeof scope === 'object' ? scope : {};
  return { organizationId: value.organizationId || null, projectId: value.projectId || null };
}

function budgetOf(manifest) {
  const budget = manifest && manifest.communicationBudget;
  if (!budget) return { total: null, used: null, remaining: null };
  const total = Number(budget.total);
  const used = Number(budget.used);
  return { total, used, remaining: Math.max(0, total - used) };
}

function validateDecisionContext(context) {
  const errors = [];
  if (!context || typeof context !== 'object') return { valid: false, errors: ['Context is required.'] };
  if (context.schemaVersion !== SCHEMA_VERSION) errors.push('Unsupported context schemaVersion.');
  if (!context.agent || !context.agent.agentId) errors.push('agent.agentId is required.');
  if (!context.intent || !context.intent.purpose || !context.intent.risk) errors.push('intent purpose and risk are required.');
  if (!Array.isArray(context.agent?.allowedChannels)) errors.push('agent.allowedChannels must be an array.');
  if (!Array.isArray(context.relationships)) errors.push('relationships must be an array.');
  return { valid: errors.length === 0, errors };
}

function denyForTopology(decision, reasonCode) {
  return { ...decision, action: 'SILENCE', scope: 'SELF', recipients: [], grounding: 'none', ttlMs: 0,
    reasonCodes: [...new Set([...(decision.reasonCodes || []), reasonCode])],
    meta: { ...(decision.meta || {}), rejectedAction: decision.action, constraint: reasonCode } };
}

function applyTopologyConstraints(context, decision, channel) {
  if (decision.action === 'SILENCE') return { allowed: true, decision, reasonCode: null };
  const topology = context.topology || {};
  const policy = topology.policy;
  if (!policy) return { allowed: true, decision, reasonCode: null };
  if (policy.variantId && policy.variantId !== topology.variantId) {
    return { allowed: false, decision: denyForTopology(decision, 'TOPOLOGY_VARIANT_MISMATCH'), reasonCode: 'TOPOLOGY_VARIANT_MISMATCH' };
  }
  if (policy.communicationAllowed === false) {
    return { allowed: false, decision: denyForTopology(decision, 'TOPOLOGY_COMMUNICATION_DENIED'), reasonCode: 'TOPOLOGY_COMMUNICATION_DENIED' };
  }
  if (Array.isArray(policy.allowedChannels) && !policy.allowedChannels.includes(channel)) {
    return { allowed: false, decision: denyForTopology(decision, 'TOPOLOGY_CHANNEL_DENIED'), reasonCode: 'TOPOLOGY_CHANNEL_DENIED' };
  }
  if (Array.isArray(policy.allowedScopes) && !policy.allowedScopes.includes(decision.scope)) {
    return { allowed: false, decision: denyForTopology(decision, 'TOPOLOGY_SCOPE_DENIED'), reasonCode: 'TOPOLOGY_SCOPE_DENIED' };
  }
  return { allowed: true, decision, reasonCode: null };
}

module.exports = { SCHEMA_VERSION, buildDecisionContext, validateDecisionContext, applyTopologyConstraints };
