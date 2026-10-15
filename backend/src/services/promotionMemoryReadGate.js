'use strict';

const subjects = require('./epistemic/oracleMemorySubject');
const checks = require('./epistemic/oracleMemoryChecks');
const { digest } = require('./trinityProvenanceValues');
const { isValidRecordHash } = require('./provenanceHash');

async function inspect(db, memory) {
  try {
    const subject = await subjects.load(db, { memoryId: memory.id,
      scope: { organizationId: memory.organization_id, projectId: memory.project_id } });
    const result = checks.checkMemory(subject.content, 'memory_rendered');
    return { ...result, binding: subject.binding, contentHash: digest(subject.content.memory.content) };
  } catch (failure) { return { status: 'inconclusive', reason: failure.code || failure.message, sourceTruth: 'not_evaluated' }; }
}

async function linkedEvidence(db, memory) {
  try {
    if (memory.evidence_status !== 'linked' || !memory.provenance_record_id) return null;
    const child = await db.get('SELECT * FROM provenance_records WHERE id=?', memory.provenance_record_id);
    if (!validChild(child, memory)) return null;
    const parent = await db.get(`SELECT * FROM provenance_records WHERE payload_hash=?
      AND organization_id IS ? AND project_id IS ?`, child.parent_hash,
    memory.organization_id, memory.project_id);
    return isValidRecordHash(parent) ? { parent } : null;
  } catch (_) { return null; }
}

function validChild(child, memory) {
  if (!isValidRecordHash(child) || !childMatchesMemory(child, memory)) return false;
  const payload = JSON.parse(child.payload_json);
  const refs = JSON.parse(memory.evidence_refs_json || '[]');
  return payloadMatchesMemory(payload, memory) && refsContainParent(refs, child.parent_hash);
}

function childMatchesMemory(child, memory) {
  return child.subject_type === 'decision' && child.subject_id === memory.id
    && child.organization_id === memory.organization_id && child.project_id === memory.project_id
    && child.payload_hash === memory.provenance_hash && Boolean(child.parent_hash);
}

function payloadMatchesMemory(payload, memory) {
  return payload.decisionId === memory.id && (!payload.agentId || payload.agentId === memory.created_by);
}

function refsContainParent(refs, parentHash) {
  return Array.isArray(refs) && refs.includes(parentHash);
}

async function filterOne(db, item) {
  const memory = await db.get('SELECT * FROM genome_decisions WHERE id=?', item.id);
  if (!memory) return null;
  if (!memory.provenance_record_id && memory.evidence_status !== 'linked') return item;
  const evidence = await linkedEvidence(db, memory);
  if (!evidence) return null;
  if (evidence.parent.subject_type !== 'strategy_promotion') {
    return { ...item, provenanceIntegrity: { status: 'integrity_only' } };
  }
  const assessment = await inspect(db, memory);
  if (assessment.status !== 'verified' || digest(item.summary) !== assessment.contentHash) return null;
  return { ...item, promotionMemory: assessment };
}

async function filter(db, items) {
  const retained = [];
  for (const item of items) {
    const accepted = await filterOne(db, item);
    if (accepted) retained.push(accepted);
  }
  return retained;
}

module.exports = { inspect, filter };
