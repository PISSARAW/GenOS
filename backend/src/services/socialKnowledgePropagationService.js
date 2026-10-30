'use strict';

const crypto = require('node:crypto');
const { canonicalize } = require('./evaluationGraders');
const provenanceHash = require('./provenanceHash');

function required(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${field} is required.`);
  return text;
}

function scopeOf(input) {
  return { organizationId: required(input.organizationId, 'organizationId'),
    projectId: required(input.projectId, 'projectId') };
}

function fail(code, message) { throw Object.assign(new Error(message), { code }); }

async function ensureTables(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS social_knowledge_receipts (
    id TEXT PRIMARY KEY, sender_agent_id TEXT NOT NULL, recipient_agent_id TEXT NOT NULL,
    source_hash TEXT NOT NULL, root_hash TEXT NOT NULL, transmission_hash TEXT NOT NULL,
    relation_id TEXT NOT NULL, organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(recipient_agent_id, root_hash, organization_id, project_id)
  );`);
}

async function sourceRecord(db, ref, scope) {
  const record = await db.get(`SELECT * FROM provenance_records WHERE (id = ? OR payload_hash = ?)
    AND organization_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 1`,
  ref, ref, scope.organizationId, scope.projectId);
  if (!record) fail('SOCIAL_EVIDENCE_SOURCE_MISSING', 'Evidence provenance source was not found in this scope.');
  if (!provenanceHash.isValidRecordHash(record)) fail('SOCIAL_EVIDENCE_SOURCE_INVALID', 'Evidence provenance hash is invalid.');
  return record;
}

async function rootRecord(db, record, scope) {
  let current = record;
  const seen = new Set();
  for (let depth = 0; current.parent_hash; depth += 1) {
    if (depth >= 32 || seen.has(current.payload_hash)) fail('SOCIAL_EVIDENCE_LINEAGE_INVALID', 'Evidence provenance lineage is cyclic or too deep.');
    seen.add(current.payload_hash);
    current = await sourceRecord(db, current.parent_hash, scope);
  }
  return current;
}

async function socialEdge({ db, senderAgentId, recipientAgentId, scope } = {}) {
  const relation = await db.get(`SELECT id, relation_type AS relationType FROM agent_relations
    WHERE ((source_agent_id = ? AND target_agent_id = ?) OR (source_agent_id = ? AND target_agent_id = ?))
      AND relation_type IN ('friend', 'neighbor') AND organization_id = ? AND project_id = ?
    ORDER BY CASE relation_type WHEN 'friend' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`,
  senderAgentId, recipientAgentId, recipientAgentId, senderAgentId, scope.organizationId, scope.projectId);
  if (!relation) fail('SOCIAL_ROUTE_FORBIDDEN', 'Evidence may only travel across a scoped friend or neighbor relation.');
  return relation;
}

function receiptId(recipientAgentId, rootHash, scope) {
  const value = [recipientAgentId, rootHash, scope.organizationId, scope.projectId].join('\u0000');
  return `social-receipt-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function transmissionPayload({ input, source, root, relation } = {}) {
  return { kind: 'social_evidence_transmission', senderAgentId: input.senderAgentId,
    recipientAgentId: input.recipientAgentId, sourceHash: source.payload_hash,
    rootHash: root.payload_hash, sourceRef: input.sourceRef, relationId: relation.id,
    relationType: relation.relationType };
}

async function existingReceipt({ db, recipientAgentId, rootHash, scope } = {}) {
  return db.get(`SELECT id, transmission_hash AS transmissionHash FROM social_knowledge_receipts
    WHERE recipient_agent_id = ? AND root_hash = ? AND organization_id = ? AND project_id = ?`,
  recipientAgentId, rootHash, scope.organizationId, scope.projectId);
}

async function persistTransmission({ db, input, scope, source, root, relation } = {}) {
  const payload = transmissionPayload({ input: input, source: source, root: root, relation: relation });
  const payloadJson = JSON.stringify(canonicalize(payload));
  const parentHash = source.payload_hash;
  const transmissionHash = provenanceHash.payloadHash(payloadJson, parentHash);
  const id = `prov-${transmissionHash.slice(0, 48)}`;
  await db.run(`INSERT OR IGNORE INTO provenance_records
    (id, subject_type, subject_id, payload_hash, parent_hash, algorithm, payload_json, organization_id, project_id)
    VALUES (?, 'social_transmission', ?, ?, ?, ?, ?, ?, ?)`,
  id, input.recipientAgentId, transmissionHash, parentHash, provenanceHash.BOUND_ALGORITHM,
  payloadJson, scope.organizationId, scope.projectId);
  const receiptKey = receiptId(input.recipientAgentId, root.payload_hash, scope);
  await db.run(`INSERT INTO social_knowledge_receipts
    (id, sender_agent_id, recipient_agent_id, source_hash, root_hash, transmission_hash,
     relation_id, organization_id, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, receiptKey, input.senderAgentId, input.recipientAgentId,
  source.payload_hash, root.payload_hash, transmissionHash, relation.id, scope.organizationId, scope.projectId);
  return { delivered: true, duplicate: false, receiptId: receiptKey,
    sourceHash: source.payload_hash, rootHash: root.payload_hash, transmissionHash,
    relationId: relation.id, relationType: relation.relationType };
}

async function transmitEvidence(input = {}) {
  const scope = scopeOf(input);
  const senderAgentId = required(input.senderAgentId, 'senderAgentId');
  const recipientAgentId = required(input.recipientAgentId, 'recipientAgentId');
  if (senderAgentId === recipientAgentId) fail('SOCIAL_ROUTE_INVALID', 'Sender and recipient must differ.');
  const sourceRef = required(input.sourceRef, 'sourceRef');
  const db = input.db || await require('../db').getDatabase();
  return require('../db').withTransaction(db, async (tx) => {
    await ensureTables(tx);
    const relation = await socialEdge({ db: tx, senderAgentId: senderAgentId, recipientAgentId: recipientAgentId, scope: scope });
    const source = await sourceRecord(tx, sourceRef, scope);
    const root = await rootRecord(tx, source, scope);
    const prior = await existingReceipt({ db: tx, recipientAgentId: recipientAgentId, rootHash: root.payload_hash, scope: scope });
    if (prior) return { delivered: false, duplicate: true, receiptId: prior.id,
      sourceHash: source.payload_hash, rootHash: root.payload_hash,
      transmissionHash: prior.transmissionHash, relationId: relation.id, relationType: relation.relationType };
    return persistTransmission({ db: tx, input: { senderAgentId, recipientAgentId, sourceRef }, scope: scope, source: source, root: root, relation: relation });
  });
}

module.exports = { ensureTables, transmitEvidence };
