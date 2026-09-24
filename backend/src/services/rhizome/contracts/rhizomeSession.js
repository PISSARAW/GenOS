'use strict';

const { SESSION_SCOPES, SESSION_STATES } = require('../constants');
const { normalizeCapabilityNode } = require('./capabilityNode');
const { normalizeCapabilityEdge } = require('./capabilityEdge');
const { normalizeCapabilityNeed } = require('./capabilityNeed');
const { invalid, objectValue, textValue, enumValue, numberValue, objectOrEmpty } = require('./validation');

function normalizeUnique(items, definition) {
  const { contract, key, field } = definition;
  if (!Array.isArray(items)) invalid(field, 'expected an array');
  const normalized = items.map(contract);
  const identifiers = normalized.map((item) => item[key]);
  if (new Set(identifiers).size !== identifiers.length) invalid(field, `duplicate ${key}`);
  return normalized;
}

function normalizeOpenGaps(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalid('openGaps', 'expected an array');
  return value.map((gap) => objectValue(gap, 'openGaps[]'));
}

function normalizeLoci(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalid('coordinationLoci', 'expected an array');
  return value.map((locus) => objectValue(locus, 'coordinationLoci[]'));
}

function normalizeBudgets(value) {
  const budgets = objectOrEmpty(value, 'budgets');
  return Object.fromEntries(Object.entries(budgets).map(([key, amount]) => [
    textValue(key, 'budgets.key'), numberValue(amount, `budgets.${key}`)
  ]));
}

function validateEdgeEndpoints(edges, nodes) {
  const nodeIds = new Set(nodes.map((node) => node.nodeId));
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) invalid('edges', `unknown endpoint for '${edge.edgeId}'`);
  }
}

function normalizeRhizomeSession(value) {
  const session = objectValue(value, 'RhizomeSession');
  const nodes = normalizeUnique(session.nodes || [], { contract: normalizeCapabilityNode, key: 'nodeId', field: 'nodes' });
  const edges = normalizeUnique(session.edges || [], { contract: normalizeCapabilityEdge, key: 'edgeId', field: 'edges' });
  validateEdgeEndpoints(edges, nodes);
  return {
    rhizomeId: textValue(session.rhizomeId, 'rhizomeId'),
    missionId: textValue(session.missionId, 'missionId'),
    scope: enumValue(session.scope, { allowed: SESSION_SCOPES, field: 'scope', fallback: 'mission' }),
    graphVersion: numberValue(session.graphVersion, 'graphVersion', { integer: true }),
    nodes,
    edges,
    activeNeeds: normalizeUnique(session.activeNeeds || [], { contract: normalizeCapabilityNeed, key: 'needId', field: 'activeNeeds' }),
    openGaps: normalizeOpenGaps(session.openGaps),
    coordinationLoci: normalizeLoci(session.coordinationLoci),
    budgets: normalizeBudgets(session.budgets),
    status: enumValue(session.status, { allowed: SESSION_STATES, field: 'status', fallback: 'ACTIVE' })
  };
}

module.exports = { normalizeRhizomeSession };
