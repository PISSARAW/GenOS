'use strict';

const { createHash, randomBytes, timingSafeEqual } = require('crypto');
const communityStore = require('../communityStore');
const { constitutionHash } = require('../governance/protocolVersioning');

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function reject(code, message) {
  throw Object.assign(new Error(message), { code });
}

async function ensureTable(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS biocenose_public_cycle_identity (
    community_id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, token_hash TEXT NOT NULL,
    mission_id TEXT, question_hash TEXT NOT NULL, constitution_id TEXT NOT NULL,
    variant TEXT NOT NULL, created_at TEXT NOT NULL)`);
}

async function committedState(db, communityId) {
  const session = await communityStore.loadSession(db, communityId);
  const record = session && await communityStore.latestConstitution(db, communityId);
  if (!session || !record || record.constitutionId !== session.constitutionId
    || constitutionHash(record.constitution) !== record.constitutionHash) {
    reject('BIOCENOSE_PUBLIC_STATE_INVALID', 'Community constitution or session identity is invalid.');
  }
  return { session, record };
}

async function issue(db, input) {
  const actorId = String(input.actorId || '').trim();
  if (!actorId) reject('BIOCENOSE_PUBLIC_ACTOR_REQUIRED', 'An orchestrator identity is required for public cycle execution.');
  const { session, record } = await committedState(db, input.communityId);
  await ensureTable(db);
  const token = randomBytes(32).toString('base64url');
  const saved = await db.run(`INSERT OR IGNORE INTO biocenose_public_cycle_identity
    (community_id, actor_id, token_hash, mission_id, question_hash,
      constitution_id, variant, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  input.communityId, actorId, digest(token), session.missionId,
  digest(session.question), record.constitutionId, record.constitution.variant,
  new Date().toISOString());
  if (saved.changes !== 1) reject('BIOCENOSE_PUBLIC_IDENTITY_EXISTS', 'Community already has a public cycle identity.');
  return { token, sessionRevision: session.revision };
}

async function verify(db, input) {
  assertProof(input);
  await ensureTable(db);
  const saved = await db.get('SELECT * FROM biocenose_public_cycle_identity WHERE community_id = ?', input.communityId);
  assertOwner(saved, input);
  const { session, record } = await committedState(db, input.communityId);
  assertBoundState({ saved, session, record, input });
  if (session.revision !== input.expectedRevision) {
    reject('BIOCENOSE_PUBLIC_REVISION_CONFLICT', 'Community revision changed before continuation.');
  }
  return { communityId: input.communityId, variant: saved.variant, sessionRevision: session.revision };
}

function assertProof(input) {
  if (!String(input.actorId || '').trim() || !String(input.token || '').trim()
    || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
    reject('BIOCENOSE_PUBLIC_PROOF_REQUIRED', 'Orchestrator, resume token and expected revision are required.');
  }
}

function assertOwner(saved, input) {
  if (!saved || saved.actor_id !== input.actorId
    || !sameDigest(saved.token_hash, digest(input.token))) {
    reject('BIOCENOSE_PUBLIC_IDENTITY_MISMATCH', 'Community continuation identity is invalid.');
  }
}

function assertBoundState({ saved, session, record, input }) {
  const identityMatches = saved.mission_id === (session.missionId ?? null)
    && saved.question_hash === digest(session.question)
    && saved.constitution_id === record.constitutionId
    && saved.variant === record.constitution.variant;
  const requestMatches = (!input.mission || input.mission === session.question)
    && (!input.variant || input.variant === saved.variant);
  if (!identityMatches || !requestMatches) {
    reject('BIOCENOSE_PUBLIC_STATE_MISMATCH', 'Community state differs from its continuation identity.');
  }
}

function sameDigest(left, right) {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

module.exports = { issue, verify };
