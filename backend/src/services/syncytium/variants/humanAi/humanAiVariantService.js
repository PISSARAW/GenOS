'use strict';

const schemaService = require('../../../syncytiumSchemaService');
const { randomUUID } = require('node:crypto');

const NUCLEUS_KINDS = new Set(['human', 'llm_worker', 'test_daemon', 'security_verifier']);
const SHARED_FIELDS = ['human.presence', 'human.leases', 'human.comments', 'human.approvals', 'critical.actions'];

function createHumanAiVariantService(syncytium) {
  return {
    createHumanAiSession: (mission, configuration) => createSession(mission, configuration, syncytium),
    updateHumanPresence: (sessionId, request) => updatePresence(sessionId, request, syncytium),
    acquireHumanLease: (sessionId, request) => acquireLease(sessionId, request, syncytium),
    releaseHumanLease: (sessionId, request) => releaseLease(sessionId, request, syncytium),
    addHumanComment: (sessionId, request) => addComment(sessionId, request, syncytium),
    submitHumanApproval: (sessionId, request) => submitApproval(sessionId, request, syncytium),
    executeApprovedAction: (sessionId, request) => executeApproved(sessionId, request, syncytium),
    humanAiSnapshot: (sessionId, options) => syncytium.snapshot(sessionId, options || {})
  };
}

function createSession(mission, configuration = {}, syncytium) {
  const nuclei = normalizeNuclei(configuration.nuclei);
  const members = nuclei.map((nucleus) => nucleus.principalId);
  const humans = nuclei.filter((nucleus) => nucleus.kind === 'human').map((nucleus) => nucleus.principalId);
  if (!humans.length) throw humanError('Human-AI Syncytium requires at least one human nucleus.');
  const fields = Object.fromEntries(SHARED_FIELDS.map((path) => [path, fieldDefinition(path)]));
  for (const [path, definition] of Object.entries(configuration.sharedFields || {})) {
    if (SHARED_FIELDS.includes(path)) throw humanError(`Shared field '${path}' is reserved by the human-AI contract.`);
    fields[path] = { ...definition, ownerDomain: 'organism', visibility: 'GLOBAL' };
  }
  const sharedPaths = Object.keys(fields).filter((path) => path !== 'human.approvals');
  const domains = [
    { domainId: 'organism', members, owns: sharedPaths },
    { domainId: 'human-authority', members: humans, owns: ['human.approvals'], mayRead: ['*'] },
    ...nuclei.map((nucleus) => ({
      domainId: nucleus.nucleusId, members: [nucleus.principalId], mayWrite: sharedPaths,
      mayRead: ['*'], subscriptions: ['*']
    }))
  ];
  return syncytium.createSession(mission, {
    ...configuration,
    schema: schemaService.compile({ schemaId: 'syncytium-human-ai-v1', fields }),
    nuclearDomains: domains
  });
}

function normalizeNuclei(input) {
  if (!Array.isArray(input) || !input.length) throw humanError('Human-AI Syncytium requires a list of nuclei.');
  const ids = new Set();
  const principals = new Set();
  return input.map((nucleus) => normalizeNucleus(nucleus, ids, principals));
}

function normalizeNucleus(nucleus, ids, principals) {
  const item = {
    nucleusId: String(nucleus?.nucleusId || '').trim(),
    principalId: String(nucleus?.principalId || '').trim(),
    kind: String(nucleus?.kind || '').toLowerCase()
  };
  if (!item.nucleusId || !item.principalId || !NUCLEUS_KINDS.has(item.kind)
    || ids.has(item.nucleusId) || principals.has(item.principalId)) {
    throw humanError('Each nucleus requires a unique id, principal and supported kind.');
  }
  ids.add(item.nucleusId);
  principals.add(item.principalId);
  return item;
}

function fieldDefinition(path) {
  const dataType = path === 'human.comments' ? 'ADD_WINS_SET' : 'MAP';
  return {
    dataType, consistencyZone: dataType === 'ADD_WINS_SET' ? 'APPEND_ONLY' : 'SERIALIZABLE',
    visibility: 'GLOBAL', ownerDomain: path === 'human.approvals' ? 'human-authority' : 'organism'
  };
}

async function updatePresence(sessionId, request = {}, syncytium) {
  requireIdentity(request);
  if (request.status && !['online', 'away', 'offline', 'reviewing'].includes(request.status)) {
    throw humanError('Presence status must be online, away, offline or reviewing.');
  }
  return applyMap({ sessionId, request, field: 'human.presence', key: request.actorId, value: {
    actorId: request.actorId, status: request.status || 'online', updatedAt: Date.now()
  }, action: 'set', syncytium });
}

async function acquireLease(sessionId, request = {}, syncytium) {
  requireIdentity(request);
  if (!request.resourceId) throw humanError('Lease acquisition requires a resourceId.');
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const current = snapshot.shared.sharedFields['human.leases']?.[request.resourceId];
  const now = Number.isSafeInteger(request.now) ? request.now : Date.now();
  ensureLeaseAvailable(current, request.actorId, now);
  const lease = buildLease({ request, current, now });
  const committed = await applyMap({
    sessionId, request, field: 'human.leases', key: request.resourceId, value: lease,
    action: 'set', syncytium, stateVersion: snapshot.shared.totalOps
  });
  return { ...committed, lease };
}

function ensureLeaseAvailable(current, actorId, now) {
  if (current && current.expiresAt > now && current.holderId !== actorId) {
    throw Object.assign(new Error('The resource is leased by another nucleus.'), { code: 'SYNCYTIUM_LEASE_HELD' });
  }
}

function buildLease(context) {
  const ttlMs = Number.isSafeInteger(context.request.ttlMs) ? context.request.ttlMs : 30000;
  const lease = {
    resourceId: context.request.resourceId, holderId: context.request.actorId,
    leaseToken: randomUUID(), fence: (context.current?.fence || 0) + 1, expiresAt: context.now + ttlMs
  };
  if (ttlMs < 1 || ttlMs > 3600000 || !Number.isSafeInteger(lease.expiresAt)) {
    throw humanError('Lease duration or expiration is outside the allowed range.');
  }
  return lease;
}

async function releaseLease(sessionId, request = {}, syncytium) {
  requireIdentity(request);
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const lease = snapshot.shared.sharedFields['human.leases']?.[request.resourceId];
  if (!lease || lease.holderId !== request.actorId || lease.leaseToken !== request.leaseToken) {
    throw Object.assign(new Error('Lease owner or fencing token does not match.'), { code: 'SYNCYTIUM_LEASE_NOT_OWNED' });
  }
  return applyMap({
    sessionId, request, field: 'human.leases', key: request.resourceId, action: 'delete',
    syncytium, stateVersion: snapshot.shared.totalOps
  });
}

async function addComment(sessionId, request = {}, syncytium) {
  requireIdentity(request);
  if (typeof request.comment !== 'string' || !request.comment.trim()) throw humanError('Comment text is required.');
  return syncytium.applyOperation(sessionId, {
    opId: request.opId || randomUUID(), actorId: request.actorId,
    domainId: request.nucleusId,
    kind: { type: 'typed_field', key: 'human.comments', action: 'add', value: {
      commentId: request.commentId || randomUUID(), actorId: request.actorId,
      text: request.comment, target: request.target || null, createdAt: Date.now()
    } }
  }, request.options || {});
}

async function submitApproval(sessionId, request = {}, syncytium) {
  requireIdentity(request);
  if (!request.nucleusId || !request.approvalId || !request.actionId || !['approved', 'rejected'].includes(request.decision)) {
    throw humanError('Approval requires a human nucleus, approvalId, actionId and decision.');
  }
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const humans = snapshot.domains['human-authority']?.members || [];
  if (!humans.includes(request.actorId)) throw humanError('Only a human principal may approve a critical action.');
  const existing = snapshot.shared.sharedFields['human.approvals']?.[request.approvalId];
  if (existing) throw Object.assign(new Error('Approval identifiers are immutable.'), { code: 'SYNCYTIUM_APPROVAL_EXISTS' });
  return applyMap({ sessionId, request: { ...request, nucleusId: 'human-authority' }, field: 'human.approvals', key: request.approvalId, value: {
    approvalId: request.approvalId, actionId: request.actionId, decision: request.decision,
    approverId: request.actorId, reason: request.reason || null, createdAt: Date.now()
  }, action: 'set', syncytium, stateVersion: snapshot.shared.totalOps });
}

async function executeApproved(sessionId, request = {}, syncytium) {
  requireIdentity(request);
  validateCriticalAction(request);
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const approval = findMatchingApproval(snapshot, request);
  ensureUnusedApproval(snapshot.shared.sharedFields['critical.actions'], request.approvalId);
  const record = {
    actionId: request.actionId, approvalId: request.approvalId, actorId: request.actorId,
    action: request.action, executedAt: Date.now()
  };
  const operation = mapOperation({ request, field: 'critical.actions', key: request.actionId, action: 'set', value: record });
  const result = await syncytium.applyTransaction(sessionId, {
    txId: request.txId || randomUUID(), operations: [operation],
    preconditions: [{ op: 'state_version', value: snapshot.shared.totalOps }], commitPolicy: 'SERIALIZABLE'
  }, { ...(request.options || {}), domainId: request.nucleusId });
  return { ...result, approval, action: record };
}

function validateCriticalAction(request) {
  if (!request.approvalId || !request.actionId || !isRecord(request.action)) {
    throw humanError('Critical action requires approvalId, actionId and an action object.');
  }
}

function findMatchingApproval(snapshot, request) {
  const approval = snapshot.shared.sharedFields['human.approvals']?.[request.approvalId];
  if (!approval || approval.actionId !== request.actionId || approval.decision !== 'approved') {
    throw Object.assign(new Error('No matching human approval exists.'), { code: 'SYNCYTIUM_APPROVAL_REQUIRED' });
  }
  return approval;
}

function ensureUnusedApproval(actions = {}, approvalId) {
  if (Object.values(actions).some((item) => item.approvalId === approvalId)) {
    throw Object.assign(new Error('This human approval has already been consumed.'), { code: 'SYNCYTIUM_APPROVAL_CONSUMED' });
  }
}

async function applyMap(context) {
  const { sessionId, request, field, key, value, action, syncytium, stateVersion } = context;
  const operation = mapOperation({ request, field, key, action, value });
  return syncytium.applyTransaction(sessionId, {
    txId: request.txId || randomUUID(), operations: [operation],
    preconditions: stateVersion === undefined ? [] : [{ op: 'state_version', value: stateVersion }],
    commitPolicy: 'SERIALIZABLE'
  }, { ...(request.options || {}), domainId: request.nucleusId || request.actorId });
}

function mapOperation(context) {
  const { request, field, key, action, value } = context;
  return {
    opId: request.opId || randomUUID(), actorId: request.actorId,
    domainId: request.nucleusId,
    kind: { type: 'typed_field', key: field, action, entryKey: key, value }
  };
}

function requireIdentity(request) {
  if (!request.actorId || !request.nucleusId) throw humanError('Human-AI operations require actorId and nucleusId.');
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function humanError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_HUMAN_AI_INVALID' });
}

module.exports = { createHumanAiVariantService };
