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
  const topology = topologySource(input);
  const policy = policySource(input, topology);
  return {
    organization: firstValue([input.organization, topology.organization]),
    topologyId: firstValue([topology.topologyId]),
    variantId: firstValue([topology.variantId, input.variantId]),
    version: versionOf(topology.version),
    policy: policyCopy(policy)
  };
}

function topologySource(input) {
  return input.topology || input.topologySnapshot || {};
}

function policySource(input, topology) {
  return input.topologyPolicy || topology.communicationPolicy || null;
}

function firstValue(values) {
  return values.find(Boolean) || null;
}

function versionOf(value) {
  return Number.isInteger(value) ? value : null;
}

function policyCopy(policy) {
  return policy && typeof policy === 'object' ? { ...policy } : null;
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
  if (!context || typeof context !== 'object') return { valid: false, errors: ['Context is required.'] };
  const errors = [];
  appendError(errors, !hasSchema(context), 'Unsupported context schemaVersion.');
  appendError(errors, !hasAgent(context), 'agent.agentId is required.');
  appendError(errors, !hasIntent(context), 'intent purpose and risk are required.');
  appendError(errors, !hasChannels(context), 'agent.allowedChannels must be an array.');
  appendError(errors, !hasRelationships(context), 'relationships must be an array.');
  return { valid: errors.length === 0, errors };
}

function hasSchema(context) { return context.schemaVersion === SCHEMA_VERSION; }
function hasAgent(context) { return Boolean(context.agent && context.agent.agentId); }
function hasIntent(context) { return Boolean(context.intent && context.intent.purpose && context.intent.risk); }
function hasChannels(context) { return Array.isArray(context.agent?.allowedChannels); }
function hasRelationships(context) { return Array.isArray(context.relationships); }

function appendError(errors, invalid, message) {
  if (invalid) errors.push(message);
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
  const reasonCode = topologyDenialCode({ policy, topology, decision, channel });
  if (reasonCode) return { allowed: false, decision: denyForTopology(decision, reasonCode), reasonCode };
  return { allowed: true, decision, reasonCode: null };
}

function topologyDenialCode(input) {
  const { policy, topology, decision, channel } = input;
  if (policy.variantId && policy.variantId !== topology.variantId) return 'TOPOLOGY_VARIANT_MISMATCH';
  if (policy.communicationAllowed === false) return 'TOPOLOGY_COMMUNICATION_DENIED';
  if (Array.isArray(policy.allowedChannels) && !policy.allowedChannels.includes(channel)) return 'TOPOLOGY_CHANNEL_DENIED';
  if (Array.isArray(policy.allowedScopes) && !policy.allowedScopes.includes(decision.scope)) return 'TOPOLOGY_SCOPE_DENIED';
  return null;
}

module.exports = { SCHEMA_VERSION, buildDecisionContext, validateDecisionContext, applyTopologyConstraints };
