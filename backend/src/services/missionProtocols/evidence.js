'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { EvidenceConversation } = require('../evidenceProtocol/conversation');
const { digest } = require('../evidenceProtocol/canonical');
const native = require('../epistemic/nativeOracleGate');
const values = require('./evidenceValues');

function refused(reason) {
  return Object.assign(new Error(`Mission EVIDENCE completion refused: ${reason}`),
    { code: 'MISSION_EVIDENCE_REQUIRED' });
}

function semanticProofAccepted(result) {
  const attestation = result?.proof?.attestation?.value;
  if (attestation?.accepted !== true || !attestation?.domain) return false;
  try { require('../epistemic/nativeOracleDomains').definition(attestation.domain); return true; }
  catch { return false; }
}

async function current(binding) {
  await require('./context').assertCurrent(binding);
}

async function verification(binding, event) {
  await current(binding);
  const historical = await native.historical(binding.db, { runId: binding.runId, agentId: binding.agentId, event });
  const result = historical || await native.context(binding.db, { row: { id: binding.runId, agent_id: binding.agentId }, event });
  if (historical) await require('../epistemic/nativeOracleProof').assertCurrent(binding.db,
    { proof: historical.proof, request: { runId: binding.runId, agentId: binding.agentId },
      report: event.payload.evidenceReport || event.payload.report });
  if (!require('../terminalQualityEvidence').acceptedProof(result?.proof)) throw refused('independent native oracle required');
  if (!semanticProofAccepted(result)) throw refused('semantic native domain required');
  const record = result.proof.attestation.value;
  if (!result.delegated && (record.runId !== binding.runId || record.agentId !== binding.agentId)) throw refused('native owner differs');
  return { ...result, missionReportDigest: digest(event.payload.evidenceReport || event.payload.report) };
}

function conversation(binding, event) {
  fs.mkdirSync(binding.directory, { recursive: true });
  return new EvidenceConversation({ dbPath: path.join(binding.directory, 'evidence.sqlite'),
    authorize: async message => {
      await current(binding);
      const expected = [binding.actor, binding.scope, binding.generations, binding.authority, binding.runId, binding.missionId];
      const actual = [message.sender, message.scope, message.generations, message.authority, message.conversationId, message.missionId];
      return digest(expected) === digest(actual);
    },
    verifyEvidence: async ({ claim }) => {
      const proof = await verification(binding, event);
      if (digest(values.claim(binding, proof)) !== digest(claim)) throw refused('native claim changed');
      return { status: 'validated', claimDigest: digest(claim), subject: claim.subject, policy: claim.policy,
        receiptDigest: digest(proof.proof.saved.evaluation) };
    },
    acceptPolicy: async ({ claim, receipt }) => {
      const proof = await verification(binding, event);
      return digest(values.claim(binding, proof)) === digest(claim)
        && receipt.receiptDigest === digest(proof.proof.saved.evaluation);
    } });
}

async function advance(runtime, input) {
  const { binding, claim, verification: proof } = input;
  const stages = [['ASSERT', null], ['REQUEST_EVIDENCE', 'asserted'],
    ['VERIFY', 'evidence_requested'], ['ACCEPT_UNDER_POLICY', 'verified']];
  for (const [type, status] of stages) {
    const held = runtime.claim(claim.claimId);
    if (status === null ? held !== null : held?.status !== status) continue;
    await runtime.apply(values.message(binding, { type, claimId: claim.claimId,
      payload: type === 'ASSERT' ? { claim } : { claimId: claim.claimId }, cause: held?.lastMessageId,
      ...values.messageTimes(binding, proof) }));
  }
  if (!runtime.canPromote(values.request(binding, claim))) throw refused('claim is not accepted under current bindings');
}

async function guardEvent(binding, event) {
  if (event?.eventType !== 'AGENT_COMPLETED') return event;
  if (event.payload?.executionRunId !== binding.runId) throw refused('event run differs');
  const proof = await verification(binding, event);
  const claim = values.claim(binding, proof);
  const runtime = conversation(binding, event);
  try {
    await advance(runtime, { binding, claim, verification: proof });
    await verification(binding, event);
    return event;
  } finally { runtime.close(); }
}

async function observe(binding, input) {
  if (input.event?.eventType !== 'AGENT_COMPLETED') return null;
  const proof = await verification(binding, input.event);
  if (!proof || !['completed', 'awaiting_approval'].includes(input.saved?.run?.status)) throw refused('accepted native completion missing');
  const claim = values.claim(binding, proof);
  const runtime = conversation(binding, input.event);
  try {
    if (!runtime.canPromote(values.request(binding, claim))) throw refused('completion dossier is not accepted');
    const dossier = { schema: 'genos.mission-evidence-dossier/v1', runId: binding.runId,
      missionId: binding.missionId, scope: binding.scope, claim, state: runtime.claim(claim.claimId),
      nativeAcceptanceHash: proof.acceptance?.hash || null, delegated: proof.delegated === true,
      eventDigest: digest(JSON.parse(JSON.stringify(input.event))) };
    await binding.db.exec(`CREATE TABLE IF NOT EXISTS mission_protocol_evidence (
      run_id TEXT PRIMARY KEY, dossier_json TEXT NOT NULL, dossier_digest TEXT NOT NULL)`);
    const prior = await binding.db.get('SELECT dossier_digest FROM mission_protocol_evidence WHERE run_id=?', binding.runId);
    if (prior && prior.dossier_digest !== digest(dossier)) throw refused('completion dossier changed');
    if (!prior) await binding.db.run('INSERT INTO mission_protocol_evidence VALUES (?,?,?)', binding.runId, JSON.stringify(dossier), digest(dossier));
    return dossier;
  } finally { runtime.close(); }
}

module.exports = { guardEvent, observe, verification, conversation };
