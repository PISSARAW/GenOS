'use strict';

const { scopeOf, scopeKey, identifier, digest } = require('./contract');
const { CONTROL_SCHEMA } = require('./regulationSchema');
const { withTransaction } = require('../../db');
const signed = require('../shev/authorityService');

function integer(value, bounds) {
  if (!Number.isSafeInteger(value) || value < bounds[0] || value > bounds[1]) throw new TypeError('Invalid GNS policy bound');
  return value;
}

function contract(input) {
  const scope = scopeOf(input.scope);
  flag(input.enabled); flag(input.predictiveHold);
  const highThreshold = input.highThreshold ?? 0.9;
  if (!Number.isFinite(highThreshold) || highThreshold < 0.7 || highThreshold > 0.95) throw new TypeError('Invalid GNS threshold');
  return { scope, managerId: identifier(input.managerId, 'managerId'),
    actorId: identifier(input.actorId, 'actorId'), enabled: input.enabled !== false, predictiveHold: input.predictiveHold === true,
    highThreshold, holdMs: integer(input.holdMs ?? 5000, [1000, 15000]),
    horizonMs: integer(input.horizonMs ?? 5000, [1000, 10000]),
    maxQueueWaitMs: integer(input.maxQueueWaitMs ?? 15000, [1000, 60000]),
    expiresAt: integer(input.expiresAt, [Date.now() + 1, Date.now() + 3600000]) };
}

function flag(value) {
  if (value !== undefined && typeof value !== 'boolean') throw new TypeError('Invalid GNS policy flag');
}

async function managerScope(db, managerId) {
  const row = await db.get(`SELECT a.id,a.status,a.is_apoptotic,w.organization_id,w.project_id
    FROM agents a JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=?`, managerId);
  if (!row || row.is_apoptotic || !['running','idle','blocked'].includes(row.status)) throw new Error('GNS_MANAGER_UNAVAILABLE');
  return scopeOf({ organizationId: row.organization_id, projectId: row.project_id });
}

async function authority(db, policy) {
  if (scopeKey(await managerScope(db, policy.managerId)) !== scopeKey(policy.scope)) throw new Error('SCOPE_MISMATCH');
  await require('../agentAuthorityService').authorizeAgentControl(db,
    { targetId: policy.managerId, actorId: policy.actorId });
  const key = await authorityKey(db, policy.scope.projectId);
  if (policy.authorityKeyHash && policy.authorityKeyHash !== digest(key)) throw new Error('GNS_AUTHORITY_REVOKED');
}

async function authorityKey(db, projectId) {
  const row = await db.get("SELECT authority_public_key FROM shev_responsibilities WHERE project_id=? AND status='active'", projectId);
  if (!row?.authority_public_key) throw new Error('GNS_AUTHORITY_REVOKED');
  return row.authority_public_key;
}

function circuitAllows(proposal) {
  const circuit = require('../circuitBreaker').canExecute('worker_deployment', 'operator',
    scopeKey(proposal.scope), { effectId: proposal.id });
  if (!circuit.allowed || circuit.state !== 'CLOSED') throw new Error(`GNS_CIRCUIT_DENIED:${circuit.reason || circuit.state}`);
}

async function enroll(db, input) {
  const policy = contract(input);
  const expectedVersion = integer(input.expectedVersion ?? 0, [0, Number.MAX_SAFE_INTEGER - 1]);
  const authorization = { ...input.authorization, operation: 'gns-regulation-enrollment',
    projectId: policy.scope.projectId, subjectId: policy.managerId, expectedVersion, details: policy };
  return withTransaction(db, async () => {
    await db.exec(CONTROL_SCHEMA);
    await authority(db, policy);
    const row = await db.get('SELECT version FROM gns_regulation_policies WHERE manager_id=?', policy.managerId);
    if ((row?.version ?? 0) !== expectedVersion) throw new Error('GNS_POLICY_VERSION_CONFLICT');
    await signed.consumeAuthorization(db, authorization);
    const version = expectedVersion + 1;
    const body = { ...policy, version, authorizationRef: authorization.nonce,
      authorityKeyHash: digest(await authorityKey(db, policy.scope.projectId)) };
    await db.run(`INSERT INTO gns_regulation_policies VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(manager_id) DO UPDATE SET organization_id=excluded.organization_id,
      project_id=excluded.project_id,version=excluded.version,body_json=excluded.body_json,
      enabled=excluded.enabled,expires_at=excluded.expires_at`, policy.managerId,
    policy.scope.organizationId, policy.scope.projectId, version, JSON.stringify(body), Number(policy.enabled), policy.expiresAt);
    return body;
  });
}

async function observationPolicy(db, managerId) {
  await db.exec(CONTROL_SCHEMA);
  const row = await db.get('SELECT * FROM gns_regulation_policies WHERE manager_id=?', managerId);
  if (!row?.enabled || row.expires_at <= Date.now()) return null;
  const policy = JSON.parse(row.body_json);
  if (policy.authorityKeyHash !== digest(await authorityKey(db, policy.scope.projectId))) throw new Error('GNS_AUTHORITY_REVOKED');
  return policy;
}

async function current(db, managerId) {
  const policy = await observationPolicy(db, managerId);
  if (policy) await authority(db, policy);
  return policy;
}

async function authorize(db, input) {
  if (input.proposal.action !== 'INHIBIT_DISPATCH') return { verdict: 'DENY' };
  const policy = await current(db, input.proposal.target);
  if (!policy || policy.version !== input.policy.version) return { verdict: 'DENY' };
  if (scopeKey(policy.scope) !== scopeKey(input.proposal.scope)) return { verdict: 'DENY' };
  const runtime = await require('./runtimeBridge').getRuntime(db);
  const evidence = require('./regulationEvidence');
  const measurement = await evidence.nativeMeasurement(runtime.store, input.proposal);
  if (!evidence.supportsInhibition(measurement, policy)) return { verdict: 'DENY' };
  circuitAllows(input.proposal);
  return { verdict: 'ALLOW', scope: policy.scope, effectId: input.proposal.id,
    decisionId: `gns-auth:${digest([policy.authorizationRef, input.proposal.id])}`,
    expiresAt: Math.min(policy.expiresAt, input.proposal.expiresAt, Date.now() + policy.holdMs) };
}

module.exports = { contract, enroll, current, observationPolicy, managerScope, authority, authorize, circuitAllows, authorityKey };
