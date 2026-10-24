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
  const topology = input.topology || {};
  return {
    organization: input.organization || topology.organization || null,
    topologyId: topology.topologyId || null,
    variantId: topology.variantId || null,
    version: Number.isInteger(topology.version) ? topology.version : null
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

module.exports = { SCHEMA_VERSION, buildDecisionContext, validateDecisionContext };
