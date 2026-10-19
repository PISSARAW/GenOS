'use strict';

const { withTransaction } = require('../../db');
const { canonicalJson, digest } = require('./durableJson');
const { ensureTables } = require('./asyncDelegationPlanService');

const TERMINAL = new Set(['accepted', 'no_change', 'human_review']);

function instant(input) {
  const nowMs = input.nowMs ?? Date.now();
  if (!Number.isFinite(nowMs)) throw new Error('horodatage-invalide');
  return { nowMs, nowIso: new Date(nowMs).toISOString() };
}

function expiry(input, nowMs) {
  const ttlMs = Number(input.ttlMs || 60000);
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('ttl-bail-invalide');
  return new Date(nowMs + ttlMs).toISOString();
}

async function missionRow(db, missionId) {
  const row = await db.get('SELECT * FROM ontogenesis_delegations WHERE id = ?', [missionId]);
  if (!row) throw new Error('mission-deleguee-introuvable');
  return row;
}

function activeLease(row, nowIso) {
  return Boolean(row.lease_owner && row.lease_expires_at && row.lease_expires_at > nowIso);
}

async function renewOwned(db, context) {
  const { row, input, expiresAt } = context;
  await db.run(`UPDATE ontogenesis_delegations SET lease_expires_at = ?, updated_at = datetime('now')
    WHERE id = ? AND lease_owner = ? AND fence = ?`,
  [expiresAt, row.id, input.owner, row.fence]);
  return { acquired: true, missionId: row.id, fence: row.fence, cursor: row.cursor, expiresAt };
}

async function acquireFresh(db, context) {
  const { row, input, expiresAt } = context;
  const fence = Number(row.fence) + 1;
  const update = await db.run(`UPDATE ontogenesis_delegations
    SET status = 'running', lease_owner = ?, lease_expires_at = ?, fence = ?, updated_at = datetime('now')
    WHERE id = ? AND fence = ?`, [input.owner, expiresAt, fence, row.id, row.fence]);
  if (update.changes !== 1) throw new Error('mission-deleguee-modifiee-concurremment');
  return { acquired: true, missionId: row.id, fence, cursor: row.cursor, expiresAt };
}

async function persistClaim(db, input) {
  const row = await missionRow(db, input.missionId);
  if (TERMINAL.has(row.status)) return { acquired: false, reason: 'mission-deleguee-terminale' };
  const time = instant(input);
  const expiresAt = expiry(input, time.nowMs);
  if (activeLease(row, time.nowIso) && row.lease_owner !== input.owner) {
    return { acquired: false, reason: 'bail-delegation-actif', fence: row.fence };
  }
  const context = { row, input, expiresAt };
  if (activeLease(row, time.nowIso)) return renewOwned(db, context);
  return acquireFresh(db, context);
}

async function claimDelegation(db, input) {
  await ensureTables(db);
  if (!input?.owner) throw new Error('proprietaire-bail-requis');
  return withTransaction(db, () => persistClaim(db, input));
}

function assertLease(row, input) {
  const { nowIso } = instant(input);
  if (row.status !== 'running') throw new Error('mission-deleguee-non-active');
  if (row.lease_owner !== input.owner || Number(row.fence) !== Number(input.fence)) {
    throw new Error('fencing-delegation-obsolete');
  }
  if (!activeLease(row, nowIso)) throw new Error('bail-delegation-expire');
}

async function existingCheckpoint(db, input) {
  return db.get(`SELECT * FROM ontogenesis_delegation_checkpoints
    WHERE mission_id = ? AND sequence = ?`, [input.missionId, input.sequence]);
}

function checkpointState(input) {
  return { state: input.state || {}, evidenceRefs: input.evidenceRefs || [] };
}

async function insertCheckpoint(db, context) {
  const { row, input, step, state, stateHash } = context;
  await db.run(`INSERT INTO ontogenesis_delegation_checkpoints
    (mission_id, sequence, step_id, fence, state_json, state_hash, artifact_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [row.id, input.sequence, step.id, input.fence,
    canonicalJson(state), stateHash, input.artifactRef || null]);
  const update = await db.run(`UPDATE ontogenesis_delegations
    SET cursor = ?, updated_at = datetime('now')
    WHERE id = ? AND cursor = ? AND lease_owner = ? AND fence = ?`,
  [input.sequence, row.id, row.cursor, input.owner, input.fence]);
  if (update.changes !== 1) throw new Error('checkpoint-delegation-concurrent');
  return { missionId: row.id, sequence: input.sequence, stepId: step.id, stateHash };
}

async function persistCheckpoint(db, input) {
  const row = await missionRow(db, input.missionId);
  assertLease(row, input);
  const plan = JSON.parse(row.plan_json);
  const step = plan.steps[input.sequence - 1];
  if (!step || step.id !== input.stepId) throw new Error('etape-checkpoint-inattendue');
  const state = checkpointState(input);
  const stateHash = digest(state);
  const existing = await existingCheckpoint(db, input);
  if (existing) {
    if (existing.step_id !== step.id || existing.state_hash !== stateHash) {
      throw new Error('checkpoint-delegation-idempotence-conflit');
    }
    return { missionId: row.id, sequence: input.sequence, stepId: step.id, stateHash, replayed: true };
  }
  if (Number(input.sequence) !== Number(row.cursor) + 1) throw new Error('sequence-checkpoint-inattendue');
  return insertCheckpoint(db, { row, input, step, state, stateHash });
}

async function checkpointDelegation(db, input) {
  await ensureTables(db);
  return withTransaction(db, () => persistCheckpoint(db, input));
}

async function interruptDelegation(db, input) {
  await ensureTables(db);
  return withTransaction(db, async () => {
    const row = await missionRow(db, input.missionId);
    assertLease(row, input);
    await db.run(`UPDATE ontogenesis_delegations SET status = 'interrupted', lease_owner = NULL,
      lease_expires_at = NULL, updated_at = datetime('now') WHERE id = ? AND fence = ?`,
    [row.id, input.fence]);
    return { missionId: row.id, status: 'interrupted', cursor: row.cursor, fence: row.fence };
  });
}

module.exports = { claimDelegation, checkpointDelegation, interruptDelegation, missionRow, assertLease };
