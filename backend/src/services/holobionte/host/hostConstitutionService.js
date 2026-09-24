'use strict';

const { randomUUID } = require('crypto');
const { appendEvent, getSession } = require('../holobiontStore');

const RISK_TOLERANCES = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);
const AUTHORITY_LEVELS = Object.freeze(['HOST', 'SYSTEM', 'USER']);
const TRANSMISSION_POLICIES = Object.freeze(['VERTICAL_REQUIRED', 'VERTICAL_PREFERRED', 'HORIZONTAL_OK', 'REACQUIRE_EACH_GENERATION', 'NEVER_INHERIT']);

function invalid(message, code = 'HOLOBIONT_CONSTITUTION_INVALID') {
  return Object.assign(new Error(message), { code });
}

function text(value, field) {
  const normalized = String(value || '').trim();
  if (!normalized) throw invalid(`${field} is required.`);
  return normalized;
}

function defaulted(input, key, fallback) {
  return input[key] === undefined || input[key] === null ? fallback : input[key];
}

function normalizeRiskTolerance(input) {
  const value = String(defaulted(input, 'riskTolerance', 'MEDIUM')).trim().toUpperCase();
  if (!RISK_TOLERANCES.includes(value)) throw invalid('riskTolerance must be LOW, MEDIUM, or HIGH.');
  return value;
}

function normalizeDependencyLimit(input) {
  const value = Number(defaulted(input, 'maxDependencyPerSymbiont', 0.7));
  if (!Number.isFinite(value) || value < 0 || value > 1) throw invalid('maxDependencyPerSymbiont must be between 0 and 1.');
  return value;
}

function normalizeTransmissionPolicy(input) {
  const value = String(defaulted(input, 'transmissionPolicy', 'NEVER_INHERIT')).trim().toUpperCase();
  if (!TRANSMISSION_POLICIES.includes(value)) throw invalid('Unknown transmissionPolicy.');
  return value;
}

function stringList(value, field) {
  if (!Array.isArray(value)) throw invalid(`${field} must be an array.`);
  return value.map((item) => text(item, field));
}

function objectValue(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${field} must be an object.`);
  return value;
}

function validateAuthority(authorityModel) {
  const authority = String(authorityModel || 'CENTRAL_HOST').trim().toUpperCase();
  if (authority === 'SYSTEM' || authority === 'USER') throw invalid('Host authority cannot exceed system or user authority.', 'HOLOBIONT_AUTHORITY_ESCALATION');
  return authority;
}

function createHostConstitution(input = {}) {
  const riskTolerance = normalizeRiskTolerance(input);
  const maxDependency = normalizeDependencyLimit(input);
  const revision = Number(defaulted(input, 'revision', 1));
  if (!Number.isInteger(revision) || revision < 1) throw invalid('revision must be a positive integer.');
  return {
    constitutionId: String(defaulted(input, 'constitutionId', randomUUID())),
    hostId: text(input.hostId, 'hostId'),
    revision,
    identity: text(input.identity, 'identity'),
    objectives: stringList(defaulted(input, 'objectives', []), 'objectives'),
    nonNegotiableInvariants: stringList(defaulted(input, 'nonNegotiableInvariants', []), 'nonNegotiableInvariants'),
    authorityModel: validateAuthority(input.authorityModel),
    authorityCeiling: 'HOST',
    privacyPolicy: objectValue(defaulted(input, 'privacyPolicy', {}), 'privacyPolicy'),
    riskTolerance,
    evidencePolicy: objectValue(defaulted(input, 'evidencePolicy', {}), 'evidencePolicy'),
    essentialCapabilities: stringList(defaulted(input, 'essentialCapabilities', []), 'essentialCapabilities'),
    maxDependencyPerSymbiont: maxDependency,
    transmissionPolicy: normalizeTransmissionPolicy(input),
    lastAmendment: defaulted(input, 'lastAmendment', null)
  };
}

function applyAmendment(input = {}) {
  const current = createHostConstitution(input.current);
  const approver = String(input.approvedBy || '').trim().toUpperCase();
  const reason = text(input.reason, 'reason');
  if (!['SYSTEM', 'USER'].includes(approver)) throw invalid('A constitution amendment requires explicit system or user approval.', 'HOLOBIONTE_AMENDMENT_AUTHORITY_REQUIRED');
  const changes = objectValue(input.changes, 'changes');
  if ('hostId' in changes || 'constitutionId' in changes || 'authorityCeiling' in changes) throw invalid('An amendment cannot transfer Host identity or raise its authority.');
  return createHostConstitution({
    ...current,
    ...changes,
    revision: current.revision + 1,
    lastAmendment: { approvedBy: approver, reason, approvedAt: new Date().toISOString() }
  });
}

function authorizeHostDecision(input = {}) {
  const constitution = createHostConstitution(input.constitution);
  const requested = String(input.requestedAuthority || 'HOST').trim().toUpperCase();
  if (!AUTHORITY_LEVELS.includes(requested)) throw invalid('Unknown authority level.');
  if (requested === 'SYSTEM' || requested === 'USER') throw invalid('Host decisions cannot exercise system or user authority.', 'HOLOBIONTE_AUTHORITY_ESCALATION');
  const changedInvariants = input.changedInvariants || [];
  if (!Array.isArray(changedInvariants)) throw invalid('changedInvariants must be an array.');
  const protectedChanges = changedInvariants.filter((item) => constitution.nonNegotiableInvariants.includes(item));
  if (protectedChanges.length) throw invalid('The decision conflicts with a non-negotiable Host invariant.', 'HOLOBIONTE_CONSTITUTIONAL_VETO');
  return { allowed: true, authority: 'HOST', constitutionId: constitution.constitutionId, revision: constitution.revision };
}

async function updateConstitution(db, input = {}) {
  const session = await getSession(db, input.holobiontId);
  if (!session) throw Object.assign(new Error('Holobiont session not found.'), { code: 'HOLOBIONT_SESSION_NOT_FOUND' });
  const constitution = createHostConstitution(input.constitution);
  if (constitution.hostId !== session.hostId) throw invalid('Constitution hostId must match the session Host.');
  const revision = await appendEvent(db, {
    holobiontId: session.holobiontId,
    eventType: 'CONSTITUTION_UPDATED',
    expectedRevision: input.expectedRevision === undefined ? session.revision : input.expectedRevision,
    actorId: input.actorId,
    payload: { constitutionId: constitution.constitutionId, constitution }
  });
  return { constitution, session: await getSession(db, session.holobiontId), eventRevision: revision };
}

module.exports = { createHostConstitution, applyAmendment, authorizeHostDecision, updateConstitution };
