'use strict';

const { randomUUID } = require('crypto');
const { withTransaction } = require('../../../db');
const immunePlane = require('../immune/holobiontImmunePlane');
const { authorizeHostDecision } = require('../host/hostConstitutionService');

const AUTHORITY_SCOPES = Object.freeze(['LOCAL', 'CAPABILITY', 'MISSION']);
const CONTRACT_STATUSES = Object.freeze(['ACTIVE', 'REVOKED', 'TERMINATED', 'EXPIRED']);
const TRANSMISSION_POLICIES = Object.freeze(['VERTICAL_REQUIRED', 'VERTICAL_PREFERRED', 'HORIZONTAL_OK', 'REACQUIRE_EACH_GENERATION', 'NEVER_INHERIT']);

function contractError(message, code = 'HOLOBIONT_CONTRACT_INVALID') {
  return Object.assign(new Error(message), { code });
}

function requireText(value, field) {
  const normalized = String(value || '').trim();
  if (!normalized) throw contractError(`${field} is required.`);
  return normalized;
}

function textList(value, field, required = false) {
  const items = Array.isArray(value) ? value.map((item) => requireText(item, field)) : null;
  if (!items || (required && items.length === 0)) throw contractError(`${field} must be a${required ? ' non-empty' : 'n'} array.`);
  return items;
}

function record(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw contractError(`${field} must be an object.`);
  return value;
}

function costMap(value, field) {
  const source = record(value, field);
  const entries = Object.entries(source).map(([key, amount]) => [requireText(key, field), Number(amount)]);
  if (entries.some(([, amount]) => !Number.isFinite(amount) || amount < 0)) throw contractError(`${field} values must be finite and non-negative.`);
  return Object.fromEntries(entries);
}

function normalizeAuthority(value) {
  const scope = String(value?.level || '').trim().toUpperCase();
  if (!AUTHORITY_SCOPES.includes(scope)) throw contractError('authorityScope.level must be LOCAL, CAPABILITY, or MISSION.', 'HOLOBIONT_AUTHORITY_ESCALATION');
  return { ...record(value, 'authorityScope'), level: scope, actions: textList(value.actions, 'authority actions') };
}

function enforcePrivacy(dataAccess, constitution) {
  const restricted = Array.isArray(constitution.privacyPolicy.restricted) ? constitution.privacyPolicy.restricted : [];
  if (dataAccess.some((item) => restricted.includes(item))) throw contractError('The contract requests data forbidden by the Host privacy policy.', 'HOLOBIONT_PRIVACY_VIOLATION');
}

function contractInput(input) {
  return input.contract || input;
}

function normalizeTransmissionPolicy(value) {
  const policy = String(value || 'NEVER_INHERIT').trim().toUpperCase();
  if (!TRANSMISSION_POLICIES.includes(policy)) throw contractError('Unknown contract transmissionPolicy.');
  return policy;
}

function validateIdentity(input, constitution) {
  const hostId = requireText(input.hostId, 'hostId');
  if (hostId !== constitution.hostId) throw contractError('Contract hostId must match the Host constitution.');
  const dependencyCeiling = Number(input.dependencyCeiling);
  if (!Number.isFinite(dependencyCeiling) || dependencyCeiling < 0 || dependencyCeiling > constitution.maxDependencyPerSymbiont) {
    throw contractError('dependencyCeiling exceeds the Host constitution.', 'HOLOBIONT_DEPENDENCY_CEILING_EXCEEDED');
  }
  const capabilitiesOffered = textList(input.capabilitiesOffered, 'capabilitiesOffered', true);
  const dataAccess = textList(input.dataAccess || [], 'dataAccess');
  enforcePrivacy(dataAccess, constitution);
  const toolLeases = textList(input.toolLeases || [], 'toolLeases');
  if (toolLeases.includes('*')) throw contractError('Wildcard tool leases are not allowed.', 'HOLOBIONT_TOOL_LEASE_INVALID');
  return { hostId, dependencyCeiling, capabilitiesOffered, dataAccess, toolLeases };
}

function contractStatus(input) {
  const status = input.status || 'ACTIVE';
  if (!CONTRACT_STATUSES.includes(status)) throw contractError('Unknown contract status.');
  return status;
}

function validateContract(input, constitution) {
  const { hostId, dependencyCeiling, capabilitiesOffered, dataAccess, toolLeases } = validateIdentity(input, constitution);
  const authorityScope = normalizeAuthority(input.authorityScope);
  const evidenceRequirements = textList(input.evidenceRequirements, 'evidenceRequirements', true);
  const terminationConditions = textList(input.terminationConditions, 'terminationConditions', true);
  return {
    contractId: String(input.contractId || randomUUID()),
    hostId,
    symbiontId: requireText(input.symbiontId, 'symbiontId'),
    capabilitiesOffered,
    resourcesRequested: costMap(input.resourcesRequested || {}, 'resourcesRequested'),
    inputs: record(input.inputs || {}, 'inputs'),
    outputs: record(input.outputs || {}, 'outputs'),
    authorityScope,
    toolLeases,
    dataAccess,
    privacyBoundary: record(input.privacyBoundary || {}, 'privacyBoundary'),
    evidenceRequirements,
    expectedBenefit: record(input.expectedBenefit, 'expectedBenefit'),
    maxCost: costMap(input.maxCost || {}, 'maxCost'),
    immunePolicy: record(input.immunePolicy || {}, 'immunePolicy'),
    adaptationPolicy: record(input.adaptationPolicy || {}, 'adaptationPolicy'),
    transmissionPolicy: normalizeTransmissionPolicy(input.transmissionPolicy),
    terminationConditions: textList(input.terminationConditions, 'terminationConditions', true),
    dependencyCeiling,
    status: contractStatus(input)
  };
}

function parseContract(row) {
  if (!row) return null;
  return { ...JSON.parse(row.contract_json), revision: row.revision, status: row.status, createdAt: row.created_at };
}

async function sessionForContract(tx, input) {
  const contract = contractInput(input);
  const row = await tx.get('SELECT holobiont_id, host_id, constitution_id, revision, session_json FROM holobiont_sessions WHERE holobiont_id = ?', input.holobiontId);
  if (!row) throw contractError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  if (input.expectedSessionRevision !== undefined && Number(input.expectedSessionRevision) !== row.revision) {
    throw contractError('Holobiont session revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  }
  const session = JSON.parse(row.session_json);
  if (!session.constitution) throw contractError('A Host constitution is required before issuing a contract.', 'HOLOBIONT_CONSTITUTION_REQUIRED');
  const symbiontIds = [...session.candidateSymbionts, ...session.residentSymbionts].map((item) => item.id);
  if (!symbiontIds.includes(contract.symbiontId)) throw contractError('Symbiont must be discovered in this session before contracting.', 'HOLOBIONT_SYMBIONT_UNKNOWN');
  return { row, session };
}

async function createContract(db, input = {}) {
  return withTransaction(db, async (tx) => {
    const { row, session } = await sessionForContract(tx, input);
    const contract = validateContract(contractInput(input), session.constitution);
    await tx.run(`INSERT INTO holobiont_symbiosis_contracts
      (contract_id, revision, holobiont_id, host_id, symbiont_id, constitution_revision, status, contract_json, created_by)
      VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)`, contract.contractId, row.holobiont_id, contract.hostId,
    contract.symbiontId, session.constitution.revision, contract.status, JSON.stringify(contract), input.actorId || null);
    return { ...contract, revision: 1 };
  });
}

async function getContract(db, holobiontId, symbiontId) {
  const row = await db.get(`SELECT contract_json, revision, status, created_at FROM holobiont_symbiosis_contracts
    WHERE holobiont_id = ? AND symbiont_id = ? ORDER BY revision DESC LIMIT 1`, holobiontId, symbiontId);
  return parseContract(row);
}

async function listContractHistory(db, contractId) {
  const rows = await db.all(`SELECT contract_json, revision, status, created_at FROM holobiont_symbiosis_contracts
    WHERE contract_id = ? ORDER BY revision`, contractId);
  return rows.map(parseContract);
}

async function authorizeSymbiontWork(db, input = {}) {
  const contract = await getContract(db, input.holobiontId, input.symbiontId);
  if (!contract || contract.status !== 'ACTIVE') throw contractError('An active SymbiosisContract is required.', 'HOLOBIONT_CONTRACT_REQUIRED');
  if (!contract.capabilitiesOffered.includes(input.capability)) throw contractError('Capability is outside the SymbiosisContract.', 'HOLOBIONT_CAPABILITY_OUT_OF_SCOPE');
  if (input.toolName && !contract.toolLeases.includes(input.toolName)) throw contractError('Tool is not leased by the SymbiosisContract.', 'HOLOBIONT_TOOL_LEASE_REQUIRED');
  return { allowed: true, contractId: contract.contractId, revision: contract.revision, authorityScope: contract.authorityScope };
}

async function appendStatusRevision(db, input, change) {
  return withTransaction(db, async (tx) => {
    const { row, session } = await sessionForContract(tx, input);
    const previous = await tx.get(`SELECT contract_json, revision, status FROM holobiont_symbiosis_contracts
      WHERE holobiont_id = ? AND symbiont_id = ? ORDER BY revision DESC LIMIT 1`, input.holobiontId, input.symbiontId);
    if (!previous) throw contractError('SymbiosisContract not found.', 'HOLOBIONT_CONTRACT_NOT_FOUND');
    if (previous.status !== 'ACTIVE') throw contractError('Only an active contract can be revoked.', 'HOLOBIONT_CONTRACT_NOT_ACTIVE');
    if (Number(input.expectedContractRevision) !== previous.revision) throw contractError('SymbiosisContract revision conflict.', 'HOLOBIONT_CONTRACT_REVISION_CONFLICT');
    const contract = { ...JSON.parse(previous.contract_json), status: change.status };
    await tx.run(`INSERT INTO holobiont_symbiosis_contracts
      (contract_id, revision, holobiont_id, host_id, symbiont_id, constitution_revision, status, contract_json, reason, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, contract.contractId, previous.revision + 1,
    row.holobiont_id, row.host_id, contract.symbiontId, session.constitution.revision,
    change.status, JSON.stringify(contract), change.reason, input.actorId || null);
    return { ...contract, revision: previous.revision + 1 };
  });
}

async function revokeContract(db, input = {}) {
  const reason = requireText(input.reason, 'reason');
  return appendStatusRevision(db, input, { status: 'REVOKED', reason });
}

function includesOnly(next, previous) {
  return next.every((item) => previous.includes(item));
}

function boundedCosts(next, previous) {
  return Object.entries(next).every(([key, value]) => value <= Number(previous[key] || 0));
}

function ensureContractTightening(next, previous) {
  const valid = includesOnly(next.capabilitiesOffered, previous.capabilitiesOffered)
    && includesOnly(next.dataAccess, previous.dataAccess)
    && includesOnly(next.toolLeases, previous.toolLeases)
    && next.dependencyCeiling <= previous.dependencyCeiling
    && boundedCosts(next.resourcesRequested, previous.resourcesRequested)
    && boundedCosts(next.maxCost, previous.maxCost)
    && next.authorityScope.level === previous.authorityScope.level
    && includesOnly(next.authorityScope.actions, previous.authorityScope.actions);
  if (!valid) throw contractError('Contract adaptation may only narrow existing permissions and budgets.', 'HOLOBIONT_ADAPTATION_ESCALATION');
}

function validateAdaptationChanges(changes) {
  const allowedChanges = new Set(['capabilitiesOffered', 'dataAccess', 'toolLeases', 'dependencyCeiling',
    'resourcesRequested', 'maxCost', 'authorityScope']);
  if (Object.keys(changes).some((key) => !allowedChanges.has(key))) {
    throw contractError('Contract adaptation contains an unsupported change.');
  }
}

async function prepareAdaptation(db, input) {
  const changes = record(input.changes, 'changes');
  validateAdaptationChanges(changes);
  const context = await sessionForContract(db, input);
  const previous = await getContract(db, input.holobiontId, input.symbiontId);
  if (!previous || previous.status !== 'ACTIVE') throw contractError('Only an active contract can be adapted.', 'HOLOBIONT_CONTRACT_NOT_ACTIVE');
  if (Number(input.expectedContractRevision) !== previous.revision) throw contractError('SymbiosisContract revision conflict.', 'HOLOBIONT_CONTRACT_REVISION_CONFLICT');
  if (input.expectedSessionRevision !== undefined && Number(input.expectedSessionRevision) !== context.row.revision) {
    throw contractError('Holobiont session revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  }
  const decision = authorizeHostDecision({
    constitution: context.session.constitution, requestedAuthority: 'HOST',
    changedInvariants: input.changedInvariants || []
  });
  const next = validateContract({ ...previous, ...changes, contractId: previous.contractId }, context.session.constitution);
  ensureContractTightening(next, previous);
  const evidenceRefs = textList(input.evidenceRefs, 'evidenceRefs', true);
  return { context, previous, next, evidenceRefs, decision, changes };
}

async function reviewAdaptation(input, proposed) {
  const { next, previous, changes, evidenceRefs } = proposed;
  const review = await immunePlane.reviewSymbiontOutput({
    symbiontId: next.symbiontId, claim: `Bounded contract adaptation ${JSON.stringify(changes)}`,
    resultHash: `${previous.contractId}:${previous.revision + 1}`,
    evidenceRefs, verifierId: input.verifierId, riskScore: input.riskScore,
    selfVerified: input.selfVerified === true
  });
  return review;
}

async function persistAdaptation(context) {
  const { db, input, proposed, review } = context;
  const { context: contractContext, previous, next, evidenceRefs, decision } = proposed;
  return withTransaction(db, async (tx) => {
    const current = await tx.get(`SELECT revision, status FROM holobiont_symbiosis_contracts
      WHERE holobiont_id = ? AND symbiont_id = ? ORDER BY revision DESC LIMIT 1`, input.holobiontId, input.symbiontId);
    if (current.revision !== previous.revision || current.status !== 'ACTIVE') {
      throw contractError('SymbiosisContract changed during adaptation.', 'HOLOBIONT_CONTRACT_REVISION_CONFLICT');
    }
    const revision = previous.revision + 1;
    const contract = { ...next, revision, adaptation: { evidenceRefs, immuneReview: review, authority: decision } };
    await tx.run(`INSERT INTO holobiont_symbiosis_contracts
      (contract_id, revision, holobiont_id, host_id, symbiont_id, constitution_revision, status, contract_json, reason, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`, contract.contractId, revision,
    input.holobiontId, contractContext.session.hostId, contract.symbiontId,
    contractContext.session.constitution.revision, JSON.stringify(contract), 'BOUNDED_ADAPTATION', input.actorId || null);
    return contract;
  });
}

async function adaptContract(db, input = {}) {
  const proposed = await prepareAdaptation(db, input);
  const review = await reviewAdaptation(input, proposed);
  if (!review.allowed) throw contractError('AEIS rejected the contract adaptation.', 'HOLOBIONT_ADAPTATION_IMMUNE_REJECTION');
  return persistAdaptation({ db, input, proposed, review });
}

module.exports = { validateContract, createContract, getContract, listContractHistory, authorizeSymbiontWork, revokeContract, adaptContract };
