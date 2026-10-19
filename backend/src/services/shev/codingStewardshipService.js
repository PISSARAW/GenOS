'use strict';

const { createHash, randomUUID, timingSafeEqual } = require('node:crypto');
const { withTransaction } = require('../../db');
const { canonicalJson } = require('../aTeam/variants/variantExecutionHelpers');
const { getResponsibility } = require('./responsibilityService');
const { migrateShevCodingStewardship } = require('../../db/migrations/migrateShevCodingStewardship');

const EFFECTS = new Set(['improved', 'neutral', 'regressed']);
const RECONCILIATIONS = new Set(['applied', 'not_applied']);
const ACTIVE_ATTEMPTS = new Set(['executing', 'transported']);
const BOUNDARIES = Object.freeze({ transportIsProof: false, deliveryIsProjectEffect: false,
  autonomousPromotionAllowed: false });

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw coded(code, 'A non-empty value is required.');
  return value.trim();
}

function scopeOf(input) {
  return { organizationId: required(input?.organizationId, 'SHEV_CODING_ORGANIZATION_REQUIRED'),
    projectId: required(input?.projectId, 'SHEV_CODING_PROJECT_REQUIRED'),
    missionId: required(input?.missionId, 'SHEV_CODING_MISSION_REQUIRED') };
}

function evidenceOf(value) {
  if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === 'string' && item.trim())) {
    throw coded('SHEV_CODING_EVIDENCE_REQUIRED', 'Independent evidence references are required.');
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function instant(input) {
  const milliseconds = Number.isFinite(input?.nowMs) ? input.nowMs : Date.now();
  return new Date(milliseconds).toISOString();
}

function digest(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function tokenMatches(token, expected) {
  const actual = Buffer.from(digest(required(token, 'SHEV_CODING_TOKEN_REQUIRED')), 'hex');
  const stored = Buffer.from(expected, 'hex');
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}

async function loadMission(db, scope) {
  return db.get(`SELECT * FROM shev_coding_missions
    WHERE organization_id=? AND project_id=? AND mission_id=?`,
  scope.organizationId, scope.projectId, scope.missionId);
}

async function currentAttempt(db, mission) {
  if (!mission?.current_attempt_id) return null;
  return db.get(`SELECT * FROM shev_coding_attempts
    WHERE organization_id=? AND project_id=? AND attempt_id=?`,
  mission.organization_id, mission.project_id, mission.current_attempt_id);
}

async function requireMission(db, scope) {
  const mission = await loadMission(db, scope);
  if (!mission) throw coded('SHEV_CODING_MISSION_NOT_FOUND', 'Coding responsibility was not found.');
  return mission;
}

async function requireCurrentAttempt(db, context) {
  const attempt = await currentAttempt(db, context.mission);
  if (!attempt || !tokenMatches(context.token, attempt.token_hash)) {
    throw coded('SHEV_CODING_ATTEMPT_FENCED', 'Coding attempt token is stale or invalid.');
  }
  return attempt;
}

function eventBody(context) {
  return { schema: 'genos.shev-coding-event/v1', organizationId: context.scope.organizationId,
    projectId: context.scope.projectId, missionId: context.scope.missionId,
    sequence: context.sequence, eventId: context.eventId,
    parentEventId: context.mission.last_event_id || null,
    attemptId: context.attemptId || null, kind: context.kind,
    evidenceRefs: context.evidenceRefs || [], payload: context.payload || {},
    observedAt: context.observedAt, boundaries: BOUNDARIES };
}

async function appendEvent(db, context) {
  const latest = await db.get(`SELECT COALESCE(MAX(sequence), 0) AS sequence
    FROM shev_coding_events WHERE organization_id=? AND project_id=? AND mission_id=?`,
  context.scope.organizationId, context.scope.projectId, context.scope.missionId);
  const body = eventBody({ ...context, sequence: Number(latest.sequence) + 1,
    eventId: `shev_code_event_${randomUUID()}` });
  await db.run(`INSERT INTO shev_coding_events
    (organization_id,project_id,mission_id,sequence,event_id,parent_event_id,
     attempt_id,kind,content_hash,payload_json,observed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, context.scope.organizationId, context.scope.projectId,
  context.scope.missionId, body.sequence, body.eventId, body.parentEventId,
  body.attemptId, body.kind, digest(body), canonicalJson(body), body.observedAt);
  await db.run(`UPDATE shev_coding_missions SET last_event_id=?, updated_at=?
    WHERE organization_id=? AND project_id=? AND mission_id=?`, body.eventId,
  body.observedAt, context.scope.organizationId, context.scope.projectId, context.scope.missionId);
  return body;
}

function assertEventChain(events, mission) {
  let parent = null;
  events.forEach((row, index) => {
    const body = JSON.parse(row.payload_json);
    const valid = row.sequence === index + 1 && body.sequence === row.sequence
      && body.eventId === row.event_id && body.parentEventId === parent
      && digest(body) === row.content_hash;
    if (!valid) throw coded('SHEV_CODING_CAUSAL_INTEGRITY_FAILED', 'Coding event chain is invalid.');
    parent = row.event_id;
  });
  if ((mission.last_event_id || null) !== parent) {
    throw coded('SHEV_CODING_CAUSAL_INTEGRITY_FAILED', 'Coding mission head is invalid.');
  }
}

async function readCodingMission(db, input) {
  await migrateShevCodingStewardship(db);
  const scope = scopeOf(input);
  const mission = await requireMission(db, scope);
  const attempt = await currentAttempt(db, mission);
  const events = await db.all(`SELECT * FROM shev_coding_events
    WHERE organization_id=? AND project_id=? AND mission_id=? ORDER BY sequence`,
  scope.organizationId, scope.projectId, scope.missionId);
  assertEventChain(events, mission);
  return { mission, attempt, events: events.map((row) => JSON.parse(row.payload_json)),
    causalIntegrity: 'verified', boundaries: BOUNDARIES };
}

async function registerCodingMission(db, input) {
  await migrateShevCodingStewardship(db);
  const scope = scopeOf(input);
  const ownerAgentId = required(input.ownerAgentId, 'SHEV_CODING_OWNER_REQUIRED');
  const objective = required(input.objective, 'SHEV_CODING_OBJECTIVE_REQUIRED');
  const responsibility = await getResponsibility(db, scope.projectId);
  if (!responsibility || responsibility.status !== 'active') {
    throw coded('SHEV_CODING_MANDATE_INACTIVE', 'An active SHEV responsibility is required.');
  }
  const existing = await loadMission(db, scope);
  if (existing) {
    if (existing.owner_agent_id !== ownerAgentId || existing.objective !== objective) {
      throw coded('SHEV_CODING_IDEMPOTENCY_CONFLICT', 'Mission identity is bound to another responsibility.');
    }
    return { ...(await readCodingMission(db, scope)), replayed: true };
  }
  const observedAt = instant(input);
  await withTransaction(db, async () => {
    await db.run(`INSERT INTO shev_coding_missions
      (organization_id,project_id,mission_id,owner_agent_id,objective,mandate_version,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`, scope.organizationId, scope.projectId, scope.missionId,
    ownerAgentId, objective, responsibility.mandateVersion, observedAt, observedAt);
    const mission = await loadMission(db, scope);
    await appendEvent(db, { scope, mission, kind: 'mission_registered', observedAt,
      payload: { ownerAgentId, objective, mandateVersion: responsibility.mandateVersion } });
  });
  return { ...(await readCodingMission(db, scope)), replayed: false };
}

function leaseOf(input, nowMs) {
  const leaseMs = input.leaseMs ?? 300000;
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > 3600000) {
    throw coded('SHEV_CODING_LEASE_INVALID', 'Coding lease must be between one second and one hour.');
  }
  return new Date(nowMs + leaseMs).toISOString();
}

async function claimCodingMission(db, input) {
  await migrateShevCodingStewardship(db);
  const scope = scopeOf(input);
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const observedAt = new Date(nowMs).toISOString();
  const token = randomUUID();
  return withTransaction(db, async () => {
    const mission = await requireMission(db, scope);
    if (mission.state !== 'open' || mission.current_attempt_id) {
      throw coded('SHEV_CODING_RESUME_BLOCKED', 'Mission needs proof or reconciliation before another attempt.');
    }
    const responsibility = await getResponsibility(db, scope.projectId);
    if (responsibility?.status !== 'active' || responsibility.mandateVersion !== mission.mandate_version) {
      throw coded('SHEV_CODING_MANDATE_CHANGED', 'Mission mandate is inactive or stale.');
    }
    const generation = mission.generation + 1;
    const attemptId = `shev_code_attempt_${randomUUID()}`;
    await db.run(`INSERT INTO shev_coding_attempts
      (organization_id,project_id,mission_id,attempt_id,generation,owner_agent_id,
       token_hash,status,lease_expires_at,started_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'executing',?,?,?)`, scope.organizationId, scope.projectId,
    scope.missionId, attemptId, generation, mission.owner_agent_id, digest(token),
    leaseOf(input, nowMs), observedAt, observedAt);
    await db.run(`UPDATE shev_coding_missions SET generation=?,current_attempt_id=?,updated_at=?
      WHERE organization_id=? AND project_id=? AND mission_id=?`, generation, attemptId,
    observedAt, scope.organizationId, scope.projectId, scope.missionId);
    const refreshed = await loadMission(db, scope);
    const event = await appendEvent(db, { scope, mission: refreshed, attemptId,
      kind: 'attempt_claimed', observedAt, payload: { generation } });
    return { attemptId, generation, token, event, boundaries: BOUNDARIES };
  });
}

async function recordTransportAccepted(db, input) {
  const scope = scopeOf(input);
  const observedAt = instant(input);
  const receiptRef = required(input.transportReceiptRef, 'SHEV_CODING_TRANSPORT_RECEIPT_REQUIRED');
  return withTransaction(db, async () => {
    const mission = await requireMission(db, scope);
    const attempt = await requireCurrentAttempt(db, { mission, token: input.token });
    if (attempt.status !== 'executing') throw coded('SHEV_CODING_TRANSPORT_STATE_INVALID', 'Attempt cannot accept transport in this state.');
    await db.run(`UPDATE shev_coding_attempts SET status='transported',updated_at=?
      WHERE attempt_id=? AND status='executing'`, observedAt, attempt.attempt_id);
    const event = await appendEvent(db, { scope, mission, attemptId: attempt.attempt_id,
      kind: 'transport_accepted', observedAt, payload: { transportReceiptRef } });
    return { event, missionComplete: false, proofLevel: 'transport', boundaries: BOUNDARIES };
  });
}

function independentProof(input, ownerAgentId) {
  const verifierRef = required(input.verifierRef, 'SHEV_CODING_VERIFIER_REQUIRED');
  if (verifierRef === ownerAgentId) {
    throw coded('SHEV_CODING_VERIFIER_NOT_INDEPENDENT', 'Producer cannot verify its own coding outcome.');
  }
  return { verifierRef, evidenceRefs: evidenceOf(input.evidenceRefs) };
}

async function recordDeliveryVerified(db, input) {
  const scope = scopeOf(input);
  const observedAt = instant(input);
  return withTransaction(db, async () => {
    const mission = await requireMission(db, scope);
    const attempt = await requireCurrentAttempt(db, { mission, token: input.token });
    if (!['executing', 'transported', 'reconciled'].includes(attempt.status)) {
      throw coded('SHEV_CODING_DELIVERY_STATE_INVALID', 'Attempt cannot be verified in this state.');
    }
    const proof = independentProof(input, mission.owner_agent_id);
    await db.run(`UPDATE shev_coding_attempts SET status='delivered',updated_at=? WHERE attempt_id=?`,
      observedAt, attempt.attempt_id);
    await db.run(`UPDATE shev_coding_missions SET state='effect_pending',updated_at=?
      WHERE organization_id=? AND project_id=? AND mission_id=?`, observedAt,
    scope.organizationId, scope.projectId, scope.missionId);
    const event = await appendEvent(db, { scope, mission, attemptId: attempt.attempt_id,
      kind: 'delivery_verified', observedAt, evidenceRefs: proof.evidenceRefs,
      payload: { verifierRef: proof.verifierRef } });
    return { event, missionComplete: false, proofLevel: 'delivery', boundaries: BOUNDARIES };
  });
}

function effectInput(input, ownerAgentId) {
  const result = required(input.result, 'SHEV_CODING_EFFECT_REQUIRED');
  if (!EFFECTS.has(result)) throw coded('SHEV_CODING_EFFECT_INVALID', 'Unsupported project effect result.');
  const before = required(input.beforeObservationRef, 'SHEV_CODING_BEFORE_REQUIRED');
  const after = required(input.afterObservationRef, 'SHEV_CODING_AFTER_REQUIRED');
  if (before === after) throw coded('SHEV_CODING_EFFECT_INCOMPARABLE', 'Project effect needs distinct observations.');
  return { ...independentProof(input, ownerAgentId), result, before, after };
}

function effectState(result) {
  if (result === 'improved') return 'verified';
  if (result === 'regressed') return 'recovery_required';
  return 'effect_pending';
}

async function recordProjectEffect(db, input) {
  const scope = scopeOf(input);
  const observedAt = instant(input);
  return withTransaction(db, async () => {
    const mission = await requireMission(db, scope);
    const attempt = await currentAttempt(db, mission);
    if (attempt?.status !== 'delivered') throw coded('SHEV_CODING_EFFECT_STATE_INVALID', 'Verified delivery is required before project effect.');
    const effect = effectInput(input, mission.owner_agent_id);
    const state = effectState(effect.result);
    await db.run(`UPDATE shev_coding_missions SET state=?,updated_at=?
      WHERE organization_id=? AND project_id=? AND mission_id=?`, state, observedAt,
    scope.organizationId, scope.projectId, scope.missionId);
    const event = await appendEvent(db, { scope, mission, attemptId: attempt.attempt_id,
      kind: `project_effect_${effect.result}`, observedAt, evidenceRefs: effect.evidenceRefs,
      payload: { verifierRef: effect.verifierRef, beforeObservationRef: effect.before,
        afterObservationRef: effect.after } });
    return { event, missionComplete: state === 'verified', proofLevel: 'project_effect', state,
      boundaries: BOUNDARIES };
  });
}

async function markExpiredAttempt(db, input) {
  const scope = scopeOf(input);
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const observedAt = new Date(nowMs).toISOString();
  return withTransaction(db, async () => {
    const mission = await requireMission(db, scope);
    const attempt = await currentAttempt(db, mission);
    if (!attempt || !ACTIVE_ATTEMPTS.has(attempt.status) || Date.parse(attempt.lease_expires_at) > nowMs) {
      throw coded('SHEV_CODING_ATTEMPT_NOT_EXPIRED', 'No expired in-flight coding attempt was found.');
    }
    await db.run(`UPDATE shev_coding_attempts SET status='ambiguous',updated_at=? WHERE attempt_id=?`,
      observedAt, attempt.attempt_id);
    await db.run(`UPDATE shev_coding_missions SET state='recovery_required',updated_at=?
      WHERE organization_id=? AND project_id=? AND mission_id=?`, observedAt,
    scope.organizationId, scope.projectId, scope.missionId);
    const event = await appendEvent(db, { scope, mission, attemptId: attempt.attempt_id,
      kind: 'attempt_ambiguous', observedAt,
      payload: { leaseExpiresAt: attempt.lease_expires_at } });
    return { event, state: 'recovery_required', blindRetryAllowed: false, boundaries: BOUNDARIES };
  });
}

async function reconcileAmbiguousAttempt(db, input) {
  const scope = scopeOf(input);
  const observedAt = instant(input);
  const outcome = required(input.outcome, 'SHEV_CODING_RECONCILIATION_REQUIRED');
  if (!RECONCILIATIONS.has(outcome)) throw coded('SHEV_CODING_RECONCILIATION_INVALID', 'Unsupported reconciliation outcome.');
  return withTransaction(db, async () => {
    const mission = await requireMission(db, scope);
    const attempt = await currentAttempt(db, mission);
    if (mission.state !== 'recovery_required' || attempt?.status !== 'ambiguous') {
      throw coded('SHEV_CODING_RECONCILIATION_STATE_INVALID', 'Mission is not awaiting ambiguity reconciliation.');
    }
    const proof = independentProof(input, mission.owner_agent_id);
    const status = outcome === 'applied' ? 'reconciled' : 'failed';
    await db.run(`UPDATE shev_coding_attempts SET status=?,updated_at=? WHERE attempt_id=?`,
      status, observedAt, attempt.attempt_id);
    await db.run(`UPDATE shev_coding_missions SET state='open',current_attempt_id=?,updated_at=?
      WHERE organization_id=? AND project_id=? AND mission_id=?`,
    outcome === 'applied' ? attempt.attempt_id : null, observedAt,
    scope.organizationId, scope.projectId, scope.missionId);
    const event = await appendEvent(db, { scope, mission, attemptId: attempt.attempt_id,
      kind: 'attempt_reconciled', observedAt, evidenceRefs: proof.evidenceRefs,
      payload: { outcome, verifierRef: proof.verifierRef } });
    return { event, outcome, resumeAllowed: outcome === 'not_applied', boundaries: BOUNDARIES };
  });
}

function followupFor(view) {
  const { mission, attempt, events } = view;
  const last = events.at(-1);
  if (mission.state === 'verified') return { kind: 'observe_project_effect', reason: 'responsibility-persists' };
  if (mission.state === 'recovery_required') {
    return last?.kind === 'attempt_ambiguous'
      ? { kind: 'reconcile_ambiguous_operation', reason: 'blind-retry-forbidden' }
      : { kind: 'recover_regression', reason: 'project-effect-regressed' };
  }
  if (mission.state === 'effect_pending') {
    return last?.kind === 'project_effect_neutral'
      ? { kind: 'diagnose_missing_effect', reason: 'delivery-without-benefit' }
      : { kind: 'measure_project_effect', reason: 'delivery-is-not-effect' };
  }
  if (attempt?.status === 'transported' || attempt?.status === 'reconciled') {
    return { kind: 'verify_delivery', reason: 'transport-is-not-proof' };
  }
  if (attempt?.status === 'executing') return { kind: 'continue_execution', reason: 'lease-active' };
  return { kind: 'continue_mission', reason: 'objective-open' };
}

async function recommendEndogenousFollowup(db, input) {
  const view = await readCodingMission(db, input);
  return { ...followupFor(view), causalParentEventId: view.mission.last_event_id,
    authority: 'proposal-only', promotionAllowed: false, boundaries: BOUNDARIES };
}

module.exports = { BOUNDARIES, registerCodingMission, claimCodingMission,
  recordTransportAccepted, recordDeliveryVerified, recordProjectEffect,
  markExpiredAttempt, reconcileAmbiguousAttempt, recommendEndogenousFollowup,
  readCodingMission };
