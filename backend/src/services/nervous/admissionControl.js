'use strict';

const { CONTROL_SCHEMA } = require('./regulationSchema');
const policies = require('./regulationPolicy');
const { scopeKey } = require('./contract');
const { withTransaction } = require('../../db');

function enabled() {
  return process.env.GENOS_NERVOUS_ENABLED === '1' && process.env.GENOS_NERVOUS_REGULATION === 'guarded';
}

async function apply(db, proposal, context) {
  return withTransaction(db, () => applyBound(db, proposal, context));
}

async function applyBound(db, proposal, context) {
  if (!enabled() || context.signal.aborted) throw new Error('GNS_REGULATION_DISABLED');
  const policy = await policies.current(db, proposal.target);
  if (!policy || policy.version !== context.policy.version) throw new Error('GNS_POLICY_REVOKED');
  if (scopeKey(policy.scope) !== scopeKey(proposal.scope)) throw new Error('SCOPE_MISMATCH');
  policies.circuitAllows(proposal);
  const runtime = await require('./runtimeBridge').getRuntime(db);
  const evidence = require('./regulationEvidence');
  const sample = await evidence.nativeMeasurement(runtime.store, proposal);
  if (!evidence.supportsInhibition(sample, policy)) throw new Error('GNS_MEASUREMENT_UNAVAILABLE');
  const now = Date.now();
  const expiresAt = effectExpiry(proposal, context, policy);
  if (expiresAt <= now || context.signal.aborted) throw new Error('GNS_EFFECT_EXPIRED');
  await db.run(`INSERT OR IGNORE INTO gns_admission_holds
    (effect_id,manager_id,organization_id,project_id,policy_version,expires_at,created_at,admission_limit,capacity)
    VALUES(?,?,?,?,?,?,?,?,?)`, proposal.id, proposal.target, policy.scope.organizationId,
  policy.scope.projectId, policy.version, expiresAt, now, Math.max(1, sample.occupied), sample.capacity);
  const hold = await read(db, proposal.id);
  if (!matchingHold(hold, proposal, policy)) throw new Error('GNS_HOLD_COLLISION');
  return hold;
}

function effectExpiry(proposal, context, policy) {
  if (!Number.isSafeInteger(context.authorizationExpiresAt)) throw new Error('GNS_EFFECT_AUTHORIZATION_REQUIRED');
  return Math.min(Date.now() + policy.holdMs, proposal.expiresAt, policy.expiresAt, context.authorizationExpiresAt);
}

function matchingHold(hold, proposal, policy) {
  return hold?.manager_id === proposal.target && hold.policy_version === policy.version
    && hold.organization_id === policy.scope.organizationId && hold.project_id === policy.scope.projectId;
}

async function read(db, effectId) {
  await db.exec(CONTROL_SCHEMA);
  return db.get('SELECT * FROM gns_admission_holds WHERE effect_id=?', effectId);
}

async function release(db, effectId) {
  await db.run('UPDATE gns_admission_holds SET released_at=? WHERE effect_id=? AND released_at IS NULL', Date.now(), effectId);
}

async function assertAdmission(db, request) {
  if (!enabled()) return;
  try { await checkAdmission(db, request); }
  catch (error) {
    if (error.code === 'GNS_ADMISSION_INHIBITED') throw error;
    throw Object.assign(new Error('GNS admission authority is unavailable'), { code: 'GNS_REGULATION_UNAVAILABLE', cause: error });
  }
}

async function checkAdmission(db, request) {
  await db.exec(CONTROL_SCHEMA);
  const hold = await db.get(`SELECT h.* FROM gns_admission_holds h
    JOIN gns_regulation_policies p ON p.manager_id=h.manager_id AND p.version=h.policy_version
    AND p.organization_id=h.organization_id AND p.project_id=h.project_id
    WHERE h.manager_id=? AND p.enabled=1 AND p.expires_at>? AND h.released_at IS NULL
      AND h.expires_at>? ORDER BY h.expires_at DESC LIMIT 1`, request.orchestratorId, Date.now(), Date.now());
  if (!hold) return;
  const policy = await admissionPolicy(db, request.orchestratorId);
  if (!policy) return;
  const state = await require('../workerGarageService').state(db, request.orchestratorId);
  if (state.capacity !== hold.capacity || state.occupied < hold.admission_limit) return;
  const runtime = await require('./runtimeBridge').getRuntime(db);
  const { RegulationJournal } = require('./regulationJournal');
  const journal = await new RegulationJournal(runtime.store).initialize();
  await journal.noteDenial(hold.effect_id);
  throw Object.assign(new Error('GNS temporarily defers new admissions; active workers continue'),
    { code: 'GNS_ADMISSION_INHIBITED', effectId: hold.effect_id });
}

async function admissionPolicy(db, managerId) {
  try { return await policies.current(db, managerId); }
  catch (error) {
    if (error.message === 'GNS_AUTHORITY_REVOKED') return null;
    if (['AEIS_AUTHORITY_REVOKED','MISSION_AUTHORITY_STALE','AGENT_CONTROL_FORBIDDEN'].includes(error.code)) return null;
    throw error;
  }
}

module.exports = { enabled, apply, read, release, assertAdmission };
