'use strict';

const crypto = require('crypto');
const { withTransaction } = require('../db');
const { recordProvenance } = require('./evaluationObservabilityService');

function normalizeEvidenceRefs(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw serviceError('evidenceRefs must be an array of SHA-256 provenance hashes.', 'DECISION_EVIDENCE_INVALID');
  const refs = [...new Set(value.map((item) => String(item?.provenanceHash || item?.hash || item || '').trim().toLowerCase()))];
  if (refs.some((hash) => !/^[a-f0-9]{64}$/.test(hash))) {
    throw serviceError('Each evidence reference must be a SHA-256 provenance hash.', 'DECISION_EVIDENCE_INVALID');
  }
  return refs;
}

function serviceError(message, code) {
  return Object.assign(new Error(message), { code });
}

function normalizeScope(scope = {}) {
  const organizationId = scope.organizationId || null;
  const projectId = scope.projectId || null;
  if (Boolean(organizationId) !== Boolean(projectId)) {
    throw serviceError('Decision scope requires both organizationId and projectId.', 'DECISION_SCOPE_INVALID');
  }
  return { organizationId, projectId };
}

async function verifyEvidenceScope(db, refs, scope) {
  for (const hash of refs) {
    const row = scope.organizationId && scope.projectId
      ? await db.get('SELECT id FROM provenance_records WHERE payload_hash = ? AND organization_id = ? AND project_id = ?', hash, scope.organizationId, scope.projectId)
      : await db.get('SELECT id FROM provenance_records WHERE payload_hash = ? AND organization_id IS NULL AND project_id IS NULL', hash);
    if (!row) throw serviceError(`Evidence provenance '${hash}' is unavailable in this decision scope.`, 'DECISION_EVIDENCE_NOT_FOUND');
  }
}

function decisionRecord(input) {
  const title = String(input.title || '').trim();
  const content = String(input.content || '').trim();
  if (!title || !content) throw serviceError('A decision title and rationale are required.', 'DECISION_CONTENT_REQUIRED');
  return {
    id: `dec-${crypto.randomUUID()}`,
    title,
    content,
    category: String(input.category || 'Architecture').trim() || 'Architecture',
    createdBy: String(input.createdBy || 'operator').trim() || 'operator',
    evidenceRefs: normalizeEvidenceRefs(input.evidenceRefs),
    scope: normalizeScope(input.scope)
  };
}

function provenancePayload(record) {
  return {
    decisionId: record.id,
    title: record.title,
    rationale: record.content,
    category: record.category,
    createdBy: record.createdBy,
    evidenceRefs: record.evidenceRefs
  };
}

async function insertDecision(db, record, evidenceStatus) {
  await db.run(
    `INSERT INTO genome_decisions (id, title, content, created_by, category, organization_id, project_id,
      evidence_refs_json, evidence_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    record.id, record.title, record.content, record.createdBy, record.category,
    record.scope.organizationId || null, record.scope.projectId || null,
    JSON.stringify(record.evidenceRefs), evidenceStatus
  );
}

async function persistDecision(input) {
  const record = decisionRecord(input);
  const evidenceStatus = record.evidenceRefs.length ? 'linked' : 'provisional';
  return withTransaction(input.db, async () => {
    await verifyEvidenceScope(input.db, record.evidenceRefs, record.scope);
    await insertDecision(input.db, record, evidenceStatus);
    const provenance = await recordProvenance('decision', record.id, provenancePayload(record), record.evidenceRefs[0] || null, record.scope);
    await input.db.run('UPDATE genome_decisions SET provenance_record_id = ?, provenance_hash = ? WHERE id = ?', provenance.id, provenance.payloadHash, record.id);
    return { id: record.id, evidenceStatus, evidenceRefs: record.evidenceRefs, provenanceId: provenance.id, provenanceHash: provenance.payloadHash };
  });
}

module.exports = { normalizeEvidenceRefs, normalizeScope, verifyEvidenceScope, persistDecision };
