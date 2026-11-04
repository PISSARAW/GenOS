'use strict';

const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');
const contract = require('./endogenousThoughtMissionContract');
const TYPES = {
  run: ['endogenous_thought_runs', require('./endogenousThoughtRunContractService')],
  verification: ['endogenous_thought_verifications', require('./endogenousThoughtVerificationContractService')],
  learning: ['endogenous_thought_learnings', require('./endogenousThoughtLearningContractService')]
};

async function load(db, input) {
  const [table, schema] = TYPES[input.kind];
  const record = input.record, id = record.receiptRefs[input.kind];
  const row = await db.get(`SELECT receipt_json,content_hash FROM ${table} WHERE receipt_id=?
    AND organization_id=? AND project_id=? AND episode_id=?`, id,
  record.organizationId, record.projectId, record.episodeId);
  if (!row) throw contract.fail('ETT_MISSION_NATIVE_EVIDENCE_MISSING');
  const receipt = JSON.parse(row.receipt_json);
  const valid = schema.readReceipt(receipt).valid && receipt.receiptId === id
    && contract.bytesDigest(canonicalJson(receipt)) === row.content_hash;
  if (!valid) throw contract.fail('ETT_MISSION_NATIVE_EVIDENCE_CHANGED');
  return receipt;
}
function assertLineage(record, native) {
  const checks = [native.run.payload.proposal.hypothesis === record.hypothesis,
    native.run.payload.proposal.sourceRefs.includes(record.receiptRefs.question),
    native.verification.payload.runRef === native.run.receiptId,
    native.verification.payload.verdict === record.verdict,
    native.verification.payload.oracleRef === record.proof.oracleRef,
    native.learning.payload.verificationRef === native.verification.receiptId,
    native.learning.payload.questionRef === record.receiptRefs.question,
    native.learning.payload.verdict === record.verdict,
    native.learning.payload.revision.applied === true];
  if (!checks.every(Boolean)) throw contract.fail('ETT_MISSION_LINEAGE_CHANGED');
}
async function verify(db, record) {
  const native = {};
  for (const kind of Object.keys(TYPES)) native[kind] = await load(db, { kind, record });
  assertLineage(record, native);
  const question = await require('./endogenousThoughtStoreService').getQuestion(db,
    { ...record, receiptId: record.receiptRefs.question });
  if (question.receipt.payload.hypothesis !== record.hypothesis) throw contract.fail('ETT_MISSION_LINEAGE_CHANGED');
  return native;
}

module.exports = { verify };
