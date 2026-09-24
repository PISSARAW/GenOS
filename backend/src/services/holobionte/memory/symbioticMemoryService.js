'use strict';

const { randomUUID, createHash } = require('crypto');
const { SCOPES } = require('../constants');
const { getSession, appendEvent } = require('../holobiontStore');
const immunePlane = require('../immune/holobiontImmunePlane');

const MEMORY_TYPES = Object.freeze([
  'EPISODIC', 'PROCEDURAL', 'PARTNER_REPUTATION', 'IMMUNE', 'LINEAGE', 'HOST_CONTINUITY'
]);

function memoryError(message, code = 'HOLOBIONT_MEMORY_INVALID') {
  return Object.assign(new Error(message), { code });
}

function text(value, field) {
  const normalized = String(value || '').trim();
  if (!normalized) throw memoryError(`${field} is required.`);
  return normalized;
}

function contentValue(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  throw memoryError('Memory content must be a non-empty string or object.');
}

function referenceList(value) {
  if (!Array.isArray(value) || !value.length) throw memoryError('Memory evidence references are required.', 'HOLOBIONT_EVIDENCE_REQUIRED');
  return value.map((reference) => text(reference, 'evidence reference'));
}

function dataClasses(input, session) {
  const classes = Array.isArray(input.dataClasses) ? input.dataClasses.map((item) => text(item, 'data class')) : [];
  const rawRestricted = session.constitution?.privacyPolicy?.restricted;
  const restricted = Array.isArray(rawRestricted) ? rawRestricted : [];
  if (classes.some((item) => restricted.includes(item))) {
    throw memoryError('Memory contains data restricted by the Host constitution.', 'HOLOBIONT_PRIVACY_VIOLATION');
  }
  return classes;
}

function validateMemoryScope(scope, session, memoryType) {
  if (!SCOPES.includes(scope)) throw memoryError('Unknown memory scope.');
  if (scope !== session.scope) throw memoryError('Memory scope must match its source session.');
  if (scope === 'PERSISTENT' && !session.constitution) {
    throw memoryError('Persistent memory requires a Host constitution.', 'HOLOBIONT_CONSTITUTION_REQUIRED');
  }
  if (memoryType === 'HOST_CONTINUITY' && scope !== 'PERSISTENT') {
    throw memoryError('Host continuity memory must use PERSISTENT scope.');
  }
}

function memoryRecord(input, session) {
  const memoryType = text(input.memoryType, 'memoryType').toUpperCase();
  if (!MEMORY_TYPES.includes(memoryType)) throw memoryError('Unknown memory type.');
  if (memoryType === 'PROCEDURAL' && input.procedureVerified !== true) {
    throw memoryError('Procedural memory requires a verified procedure.', 'HOLOBIONT_PROCEDURE_UNVERIFIED');
  }
  const scope = String(input.scope || session.scope).toUpperCase();
  validateMemoryScope(scope, session, memoryType);
  const content = contentValue(input.content);
  const evidenceRefs = referenceList(input.evidenceRefs);
  return {
    memoryId: String(input.memoryId || randomUUID()), revision: 1,
    sourceHolobiontId: session.holobiontId, hostId: session.hostId, scope,
    missionId: session.missionId, workspaceId: session.workspaceId, projectId: session.projectId,
    memoryType, status: 'ACTIVE', content, dataClasses: dataClasses(input, session), evidenceRefs,
    authorId: input.authorId || null, reason: null,
    resultHash: input.resultHash || `sha256:${createHash('sha256').update(JSON.stringify(content)).digest('hex')}`
  };
}

async function recordMemory(db, input = {}) {
  const session = await getSession(db, input.holobiontId);
  if (!session) throw memoryError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  if (Number(input.expectedSessionRevision) !== session.revision) {
    throw memoryError('Holobiont session revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  }
  const record = memoryRecord(input, session);
  const review = await immunePlane.reviewSymbiontOutput({
    symbiontId: session.hostId, claim: JSON.stringify(record.content),
    resultHash: record.resultHash, evidenceRefs: record.evidenceRefs,
    verifierId: input.authorId, riskScore: input.riskScore,
    selfVerified: input.selfVerified === true
  });
  if (!review.allowed) {
    const sessionRevision = await appendEvent(db, {
      holobiontId: session.holobiontId, eventType: 'IMMUNE_REJECTION',
      expectedRevision: session.revision, actorId: input.authorId,
      payload: { memoryType: record.memoryType, resultHash: record.resultHash, immuneReview: review }
    });
    return { accepted: false, reason: 'AEIS_IMMUNE_REJECTION', immuneReview: review, sessionRevision };
  }
  record.immuneReview = review;
  await insertMemory(db, record);
  return record;
}

async function insertMemory(db, record) {
  await db.run(`INSERT INTO holobiont_memories
    (memory_id, revision, source_holobiont_id, host_id, scope, mission_id, workspace_id,
     project_id, memory_type, status, content_json, data_classes_json, evidence_refs_json,
     immune_review_json, author_id, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  record.memoryId, record.revision, record.sourceHolobiontId, record.hostId, record.scope,
  record.missionId, record.workspaceId, record.projectId, record.memoryType, record.status,
  JSON.stringify(record.content), JSON.stringify(record.dataClasses), JSON.stringify(record.evidenceRefs),
  JSON.stringify(record.immuneReview), record.authorId, record.reason || null);
}

async function memoryContext(db, holobiontId) {
  const session = await getSession(db, holobiontId);
  if (!session) throw memoryError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  return session;
}

async function recallMemories(db, input = {}) {
  const session = await memoryContext(db, input.holobiontId);
  const rows = await db.all(`SELECT * FROM holobiont_memories WHERE host_id = ? AND (
      source_holobiont_id = ? OR (scope = 'PERSISTENT' AND host_id = ?)
      OR (scope = 'MISSION' AND mission_id = ?)
      OR (scope = 'WORKSPACE' AND workspace_id = ?)
      OR (scope = 'PROJECT' AND project_id = ?)
    ) ORDER BY created_at, revision`, session.hostId, session.holobiontId, session.hostId,
  session.missionId, session.workspaceId, session.projectId);
  return latestMemories(rows, input.memoryType);
}

function latestMemories(rows, memoryType) {
  const latest = new Map();
  for (const row of rows) {
    if (!memoryType || row.memory_type === memoryType) latest.set(row.memory_id, row);
  }
  return [...latest.values()].filter((row) => row.status === 'ACTIVE').map(parseMemory);
}

function parseMemory(row) {
  return {
    memoryId: row.memory_id, revision: row.revision, hostId: row.host_id,
    sourceHolobiontId: row.source_holobiont_id, scope: row.scope,
    memoryType: row.memory_type, status: row.status,
    content: JSON.parse(row.content_json), dataClasses: JSON.parse(row.data_classes_json),
    evidenceRefs: JSON.parse(row.evidence_refs_json), immuneReview: JSON.parse(row.immune_review_json),
    reason: row.reason, createdAt: row.created_at
  };
}

async function retractMemory(db, input = {}) {
  const session = await memoryContext(db, input.holobiontId);
  const reason = text(input.reason, 'reason');
  const previous = await db.get(`SELECT * FROM holobiont_memories
    WHERE memory_id = ? ORDER BY revision DESC LIMIT 1`, input.memoryId);
  if (!previous || previous.host_id !== session.hostId) throw memoryError('Memory not found for this Host.', 'HOLOBIONT_MEMORY_NOT_FOUND');
  if (previous.status !== 'ACTIVE') throw memoryError('Only active memory can be retracted.');
  if (Number(input.expectedMemoryRevision) !== previous.revision) {
    throw memoryError('Memory revision conflict.', 'HOLOBIONT_MEMORY_REVISION_CONFLICT');
  }
  const record = {
    memoryId: previous.memory_id, revision: previous.revision + 1,
    sourceHolobiontId: previous.source_holobiont_id, hostId: previous.host_id,
    scope: previous.scope, missionId: previous.mission_id, workspaceId: previous.workspace_id,
    projectId: previous.project_id, memoryType: previous.memory_type, status: 'RETRACTED',
    content: JSON.parse(previous.content_json), dataClasses: JSON.parse(previous.data_classes_json),
    evidenceRefs: JSON.parse(previous.evidence_refs_json), immuneReview: JSON.parse(previous.immune_review_json),
    authorId: input.actorId || null, reason
  };
  await insertMemory(db, record);
  return { memoryId: record.memoryId, revision: record.revision, status: record.status };
}

module.exports = { recordMemory, recallMemories, retractMemory, MEMORY_TYPES };
