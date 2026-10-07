'use strict';
const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { persistDecision } = require('./decisionEvidenceService');
const { agent, failure } = require('./studioWorldsService');

function text(value, limit) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw failure('MEMORY_INPUT_INVALID', 400);
  return value.trim();
}

async function list(db, context) {
  const query = String(context.query.q || '').slice(0, 200).replace(/[\\%_]/g, item => '\\' + item);
  const items = await db.all(`SELECT id, title, content, category, created_by, evidence_status,
    provenance_hash, created_at FROM genome_decisions WHERE organization_id = ? AND project_id = ?
    AND (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\') ORDER BY created_at DESC, id DESC LIMIT 100`,
  context.scope.organizationId, context.scope.projectId, '%' + query + '%', '%' + query + '%');
  return { memories: items, retrieval: 'keyword', limit: 100, truthValidated: false };
}

async function memory(db, context) {
  const row = await db.get(`SELECT * FROM genome_decisions WHERE id = ? AND organization_id = ? AND project_id = ?`,
    context.memoryId, context.scope.organizationId, context.scope.projectId);
  if (!row) throw failure('MEMORY_NOT_FOUND', 404);
  return row;
}

async function verify(db, context) {
  const row = await memory(db, context);
  const record = await db.get(`SELECT * FROM provenance_records WHERE id = ? AND organization_id = ? AND project_id = ?`,
    row.provenance_record_id, context.scope.organizationId, context.scope.projectId);
  if (!record) throw failure('MEMORY_PROVENANCE_REQUIRED', 409);
  const actual = crypto.createHash('sha256').update(record.payload_json).digest('hex');
  const payload = JSON.parse(record.payload_json);
  const bound = payload.decisionId === row.id && payload.title === row.title && payload.rationale === row.content && payload.createdBy === row.created_by;
  if (JSON.stringify(payload.evidenceRefs) !== row.evidence_refs_json) throw failure('MEMORY_INTEGRITY_INVALID', 409);
  if (!bound || actual !== record.payload_hash || actual !== row.provenance_hash) throw failure('MEMORY_INTEGRITY_INVALID', 409);
  return { row, hash: actual };
}

async function inspect(db, context) {
  const checked = await verify(db, context);
  return { memory: { id: checked.row.id, title: checked.row.title, content: checked.row.content,
    evidenceStatus: checked.row.evidence_status, sourceAgent: checked.row.created_by,
    provenanceHash: checked.hash, evidenceRefs: JSON.parse(checked.row.evidence_refs_json || '[]'), integrityChecked: true }, truthValidated: false };
}

async function record(db, context) {
  if (Array.isArray(context.body.evidenceRefs) && context.body.evidenceRefs.length > 100) throw failure('MEMORY_INPUT_INVALID', 400);
  const saved = await persistDecision({ db, scope: context.scope, createdBy: context.actor,
    title: text(context.body.title, 200), content: text(context.body.content, 20000),
    category: 'StudioDecision', evidenceRefs: context.body.evidenceRefs });
  return { ...saved, truthValidated: false, promotionGranted: false };
}

async function transfer(db, context) {
  return withTransaction(db, async () => {
    const checked = await verify(db, context);
    const target = await agent(db, { scope: context.scope, agentId: context.body.targetAgentId });
    const reason = text(context.body.reason, 2000);
    const content = JSON.stringify({ sourceDecisionId: checked.row.id, sourceHash: checked.hash,
      sourceContent: checked.row.content, targetAgentId: target.id, actor: context.actor, reason });
    const saved = await persistDecision({ db, scope: context.scope, title: 'Transmission : ' + checked.row.title,
      content, createdBy: target.id, category: 'StudioTransfer', evidenceRefs: [checked.hash] });
    return { ...saved, sourceDecisionId: checked.row.id, parentHash: checked.hash, targetAgentId: target.id,
      integrityChecked: true, truthValidated: false, promotionGranted: false };
  });
}

module.exports = { list, inspect, record, transfer };
