'use strict';

const { randomUUID } = require('crypto');
const { SCOPES, STATUSES } = require('../constants');

function requireText(value, field) {
  const text = String(fallback(value, '')).trim();
  if (!text) throw Object.assign(new Error(`${field} is required.`), { code: 'HOLOBIONT_SESSION_INVALID' });
  return text;
}

function fallback(value, defaultValue) {
  return value === undefined || value === null ? defaultValue : value;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function objectValue(value, defaultValue) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : defaultValue;
}

function validateScope(input) {
  if (!SCOPES.includes(input.scope)) throw Object.assign(new Error('Unknown Holobiont scope.'), { code: 'HOLOBIONT_SCOPE_INVALID' });
  if (input.scope === 'MISSION') requireText(input.missionId, 'missionId');
  if (input.scope === 'WORKSPACE') requireText(input.workspaceId, 'workspaceId');
  if (input.scope === 'PROJECT') requireText(input.projectId, 'projectId');
}

function createHolobiontSession(input = {}) {
  const scope = fallback(input.scope, 'MISSION');
  const status = fallback(input.status, 'ACTIVE');
  const session = {
    holobiontId: String(fallback(input.holobiontId, randomUUID())),
    hostId: requireText(input.hostId, 'hostId'),
    missionId: fallback(input.missionId, null),
    constitutionId: fallback(input.constitutionId, null),
    constitution: objectValue(input.constitution, null),
    scope,
    workspaceId: fallback(input.workspaceId, null),
    projectId: fallback(input.projectId, null),
    residentSymbionts: arrayValue(input.residentSymbionts),
    candidateSymbionts: arrayValue(input.candidateSymbionts),
    immuneState: objectValue(input.immuneState, {}),
    resourceState: objectValue(input.resourceState, {}),
    transmissionState: objectValue(input.transmissionState, {}),
    phenotype: objectValue(input.phenotype, { capabilities: [] }),
    dependencyGraph: objectValue(input.dependencyGraph, { edges: [] }),
    variantState: objectValue(input.variantState, { variantId: null, policy: null, selectionReceipt: null, evaluations: [] }),
    status,
    revision: 0
  };
  validateScope(session);
  if (!STATUSES.includes(session.status)) throw Object.assign(new Error('Unknown Holobiont status.'), { code: 'HOLOBIONT_STATUS_INVALID' });
  return session;
}

module.exports = { createHolobiontSession, validateScope };
