'use strict';

const { randomUUID } = require('crypto');
const { withTransaction } = require('../../db');
const { migrateBiocenoseSessions } = require('../../db/migrations/migrateBiocenoseSessions');
const { COMMUNITY_EVENTS } = require('./constants');
const { validateSession } = require('./contracts/communitySessionContract');
const { validateMember } = require('./contracts/memberContract');

const initializedDatabases = new WeakSet();

async function ensureSchema(db) {
  if (initializedDatabases.has(db)) return;
  await migrateBiocenoseSessions(db);
  initializedDatabases.add(db);
}

function sessionRecord(input) {
  const now = new Date().toISOString();
  return {
    communityId: defaultValue(input.communityId, randomUUID()),
    missionId: defaultValue(input.missionId, null),
    question: String(defaultValue(input.question, '')).trim(),
    questionType: defaultValue(input.questionType, null),
    constitutionId: defaultValue(input.constitutionId, null),
    phase: defaultValue(input.phase, 'CONSTITUTION'),
    round: sessionRound(input.round),
    status: defaultValue(input.status, 'ACTIVE'),
    judgmentId: defaultValue(input.judgmentId, null),
    revision: 0,
    members: defaultValue(input.members, []),
    createdAt: defaultValue(input.createdAt, now),
    updatedAt: defaultValue(input.updatedAt, now)
  };
}

function defaultValue(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

function sessionRound(value) {
  return Number.isInteger(value) ? value : 0;
}

function assertValid(result, code) {
  if (result.valid) return;
  throw Object.assign(new Error(result.errors.join(' ')), { code });
}

async function createSession(db, input = {}) {
  await ensureSchema(db);
  const session = sessionRecord(input);
  assertValid(validateSession(session), 'BIOCENOSE_SESSION_INVALID');
  return withTransaction(db, async () => {
    await insertSession(db, session);
    await insertEvent(db, {
      communityId: session.communityId, revision: 0, type: 'COMMUNITY_CREATED',
      actorId: input.actorId, payload: { missionId: session.missionId, questionType: session.questionType }
    });
    session.revision = await insertMembers(db, session);
    if (session.revision > 0) await db.run(
      'UPDATE biocenose_communities SET revision = ? WHERE community_id = ?',
      session.revision, session.communityId
    );
    return session;
  });
}

async function insertSession(db, session) {
  await db.run(
    `INSERT INTO biocenose_communities
      (community_id, mission_id, question, question_type, constitution_id, phase, round,
       status, judgment_id, revision, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    session.communityId, session.missionId, session.question, session.questionType,
    session.constitutionId, session.phase, session.round, session.status,
    session.judgmentId, session.createdAt, session.updatedAt
  );
}

async function insertMembers(db, session) {
  let revision = 0;
  for (let index = 0; index < session.members.length; index += 1) {
    const member = memberRecord(session, session.members[index], index);
    assertValid(validateMember(member), 'BIOCENOSE_MEMBER_INVALID');
    await db.run(
      `INSERT INTO biocenose_members
        (member_record_id, community_id, member_id, role, attributes_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`,
      randomUUID(), session.communityId, member.memberId, member.role,
      JSON.stringify(member.attributes), session.createdAt
    );
    revision += 1;
    await insertEvent(db, {
      communityId: session.communityId, revision, type: 'MEMBER_RECRUITED',
      actorId: member.memberId, payload: { role: member.role }
    });
  }
  return revision;
}

function memberRecord(session, source, index) {
  const member = source || {};
  const memberId = member.memberId || member.id || `${member.role || 'member'}:${member.memberNumber || index + 1}`;
  const { role, ...attributes } = member;
  return { memberId, role, attributes: { ...attributes, communityId: session.communityId } };
}

async function appendEvent(db, input) {
  await ensureSchema(db);
  validateEvent(input);
  return withTransaction(db, async () => {
    const current = await db.get('SELECT * FROM biocenose_communities WHERE community_id = ?', input.communityId);
    if (!current) throw unknownCommunity(input.communityId);
    const next = nextSession(current, input.patch || {});
    const result = await db.run(
      `UPDATE biocenose_communities SET question_type = ?, constitution_id = ?, phase = ?, round = ?,
       status = ?, judgment_id = ?, revision = ?, updated_at = ?
       WHERE community_id = ? AND revision = ?`,
      next.questionType, next.constitutionId, next.phase, next.round, next.status,
      next.judgmentId, next.revision, next.updatedAt, input.communityId, current.revision
    );
    if (result.changes !== 1) throw conflict(input.communityId);
    await insertEvent(db, { ...input, revision: next.revision });
    return loadSession(db, input.communityId);
  });
}

function validateEvent(input) {
  if (!input || typeof input.communityId !== 'string' || !input.communityId.trim()) {
    throw Object.assign(new Error('communityId is required.'), { code: 'BIOCENOSE_EVENT_INVALID' });
  }
  if (!COMMUNITY_EVENTS.includes(input.type)) {
    throw Object.assign(new Error(`Unsupported Biocenose event '${input.type}'.`), { code: 'BIOCENOSE_EVENT_INVALID' });
  }
}

function nextSession(current, patch) {
  const next = {
    ...current,
    questionType: patch.questionType ?? current.question_type,
    constitutionId: patch.constitutionId ?? current.constitution_id,
    phase: patch.phase ?? current.phase,
    round: patch.round ?? current.round,
    status: patch.status ?? current.status,
    judgmentId: patch.judgmentId ?? current.judgment_id,
    revision: Number(current.revision) + 1,
    members: [],
    updatedAt: new Date().toISOString()
  };
  assertValid(validateSession({ ...mapSession(next), members: [] }), 'BIOCENOSE_SESSION_INVALID');
  return next;
}

async function insertEvent(db, event) {
  const { communityId, revision, type, actorId, payload = {} } = event;
  await db.run(
    `INSERT INTO biocenose_events (event_id, community_id, revision, event_type, actor_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(), communityId, revision, type, actorId || null,
    JSON.stringify(payload || {}), new Date().toISOString()
  );
}

async function loadSession(db, communityId) {
  await ensureSchema(db);
  const row = await db.get('SELECT * FROM biocenose_communities WHERE community_id = ?', communityId);
  if (!row) return null;
  const members = await db.all(
    'SELECT member_id, role, attributes_json, status FROM biocenose_members WHERE community_id = ? ORDER BY rowid',
    communityId
  );
  return { ...mapSession(row), members: members.map(mapMember) };
}

function mapSession(row) {
  return {
    communityId: row.community_id || row.communityId,
    missionId: row.mission_id ?? row.missionId,
    question: row.question,
    questionType: row.question_type ?? row.questionType,
    constitutionId: row.constitution_id ?? row.constitutionId,
    phase: row.phase,
    round: Number(row.round) || 0,
    status: row.status,
    judgmentId: row.judgment_id ?? row.judgmentId,
    revision: Number(row.revision) || 0,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt
  };
}

function mapMember(row) {
  return {
    memberId: row.member_id,
    role: row.role,
    status: row.status,
    ...parseJson(row.attributes_json)
  };
}

async function listEvents(db, communityId) {
  await ensureSchema(db);
  const rows = await db.all(
    'SELECT revision, event_type, actor_id, payload_json, created_at FROM biocenose_events WHERE community_id = ? ORDER BY revision',
    communityId
  );
  return rows.map((row) => ({
    revision: Number(row.revision), type: row.event_type, actorId: row.actor_id,
    payload: parseJson(row.payload_json), createdAt: row.created_at
  }));
}

function parseJson(value) {
  try { return JSON.parse(value || '{}'); } catch (_) { return {}; }
}

function unknownCommunity(id) {
  return Object.assign(new Error(`Unknown Biocenose community '${id}'.`), { code: 'BIOCENOSE_COMMUNITY_UNKNOWN' });
}

function conflict(id) {
  return Object.assign(new Error(`Biocenose session revision conflict for '${id}'.`), { code: 'BIOCENOSE_SESSION_CONFLICT' });
}

module.exports = { createSession, appendEvent, loadSession, listEvents, ensureSchema };
