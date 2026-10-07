'use strict';

const subjects = require('./epistemic/oracleMemorySubject');
const checks = require('./epistemic/oracleMemoryChecks');
const { digest } = require('./trinityProvenanceValues');

async function inspect(db, memory) {
  try {
    const subject = await subjects.load(db, { memoryId: memory.id,
      scope: { organizationId: memory.organization_id, projectId: memory.project_id } });
    const result = checks.checkMemory(subject.content, 'memory_rendered');
    return { ...result, binding: subject.binding, contentHash: digest(subject.content.memory.content) };
  } catch (failure) { return { status: 'inconclusive', reason: failure.code || failure.message, sourceTruth: 'not_evaluated' }; }
}

async function filter(db, items) {
  const retained = [];
  for (const item of items) {
    const memory = await db.get('SELECT * FROM genome_decisions WHERE id=?', item.id);
    if (!memory?.provenance_record_id && memory?.evidence_status !== 'linked') { retained.push(item); continue; }
    const assessment = await inspect(db, memory);
    if (assessment.status === 'verified' && digest(item.summary) === assessment.contentHash) retained.push({ ...item, promotionMemory: assessment });
  }
  return retained;
}

module.exports = { inspect, filter };
