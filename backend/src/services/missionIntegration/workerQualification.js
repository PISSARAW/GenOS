'use strict';
const crypto = require('node:crypto');
const { digest, fail } = require('./contract');
const authority = require('../missionEnvelopeAuthority');
const biology = require('../biologicalWorkerStore');
const dna = require('../workerDnaIncarnation');

function includesContext(prompt, text) {
  if (typeof prompt === 'string') return prompt.includes(text);
  return Array.isArray(prompt) && prompt.some(part => typeof part.text === 'string' && part.text.includes(text));
}
async function modelContext(db, input) {
  const turns = await db.all('SELECT request_json,request_hash FROM organism_model_turns WHERE agent_id=? AND status=?',
    input.agentId, 'completed');
  let found = false;
  for (const turn of turns) {
    if (crypto.createHash('sha256').update(turn.request_json).digest('hex') !== turn.request_hash) {
      throw fail('MISSION_MECHANISMS_MODEL_CONTEXT_TAMPERED');
    }
    if (includesContext(JSON.parse(turn.request_json).prompt, input.contextText)) found = true;
  }
  if (!found) throw fail('MISSION_MECHANISMS_MODEL_CONTEXT_MISSING');
}
async function incarnation(db, input) {
  const binding = await biology.binding(db, input.execution.id);
  if (!binding || binding.missionId !== input.receipt.missionId || binding.workerId !== input.member.workerId) {
    throw fail('MISSION_MECHANISMS_NATIVE_WORKER_REQUIRED');
  }
  const agent = await db.get('SELECT * FROM agents WHERE id=?', input.member.workerId);
  const scope = { organizationId: input.receipt.organizationId, projectId: input.receipt.projectId };
  const record = dna.verifiedBinding({ ...agent,
    metadata_json: JSON.stringify({ dnaIncarnation: binding.genome.dna }) }, scope);
  if (!record) throw fail('MISSION_MECHANISMS_DNA_REQUIRED');
  await dna.validateSource(db, { record, scope });
  const envelope = await authority.read(db, input.execution.id);
  const clinical = await require('../workerClinicalAdmission').verifyRun(db, {
    runId: input.execution.id, agentId: agent.id, missionId: input.receipt.missionId,
    scope, at: envelope.envelope.issuedAt });
  if (digest(binding.clinicalAdmission) !== clinical.hash || envelope.envelope.clinicalAdmissionHash !== clinical.hash) {
    throw fail('MISSION_MECHANISMS_CLINICAL_BINDING_INVALID');
  }
  return { dna: { genomeRef: record.genomeRef, contentHash: record.contentHash, selectionId: record.selectionId },
    clinical: { hash: clinical.hash, scanEventId: clinical.record.scan.id, at: envelope.envelope.issuedAt } };
}
async function qualifyWorker(db, input) {
  const execution = await db.get('SELECT * FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', input.member.workerId);
  if (execution?.status !== 'completed') throw fail('MISSION_MECHANISMS_WORKER_INCOMPLETE');
  await authority.assertCompletedRunEvidence(db, { agentId: input.member.workerId, runId: execution.id });
  const binding = await require('../missionProtocols/context').load(db, execution.id);
  if (binding?.missionId !== input.receipt.missionId || !includesContext(binding.mission.prompt, input.contextText)) {
    throw fail('MISSION_MECHANISMS_SEALED_CONTEXT_MISSING');
  }
  await modelContext(db, { agentId: input.member.workerId, contextText: input.contextText });
  const inherited = await incarnation(db, { ...input, execution });
  const quality = await require('../qualityElevation/qualityReceiptStore').get(db, {
    runId: execution.id, contractDigest: input.member.qualityElevation?.digest });
  if (!quality?.receipt.qualityAccepted) throw fail('MISSION_MECHANISMS_WORKER_QUALITY_REQUIRED');
  const protocols = await require('./protocolQualification').audit(db, execution.id);
  const scope = { organizationId: input.receipt.organizationId, projectId: input.receipt.projectId, entityId: input.member.workerId };
  const ledger = await require('../gvxDevelopmentLedger').verifyLedgerChain(db, scope);
  if (!ledger.valid || ledger.controlPlaneMac !== 'verified') throw fail('MISSION_MECHANISMS_GVX_REQUIRED');
  return { workerId: input.member.workerId, runId: execution.id, ...inherited, contextDigest: input.receipt.contextDigest,
    qualityReceiptId: quality.receipt.receiptId, qualityArtifactDigest: quality.receipt.artifactDigest, protocols, ledger };
}
module.exports = { qualifyWorker };
