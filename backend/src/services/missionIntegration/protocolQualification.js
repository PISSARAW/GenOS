'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const Database = require('better-sqlite3');
const { digest } = require('../evidenceProtocol/canonical');

function sqlite(filename, inspect) {
  const db = new Database(filename, { readonly: true, fileMustExist: true });
  try { return inspect(db); } finally { db.close(); }
}

async function evidence(db, binding) {
  const row = await db.get('SELECT * FROM mission_protocol_evidence WHERE run_id=?', binding.runId);
  assert.ok(row, 'An accepted native EVIDENCE dossier is required.');
  const dossier = JSON.parse(row.dossier_json);
  assert.equal(row.dossier_digest, digest(dossier));
  assert.equal(dossier.runId, binding.runId);
  assert.equal(dossier.missionId, binding.missionId);
  assert.equal(dossier.state.status, 'accepted');
  assert.equal(digest(dossier.scope), digest(binding.scope));
  const events = sqlite(path.join(binding.directory, 'evidence.sqlite'), store => store.prepare(
    'SELECT message FROM evidence_protocol_events ORDER BY sequence').all().map(r => JSON.parse(r.message).type));
  for (const type of ['ASSERT', 'REQUEST_EVIDENCE', 'VERIFY', 'ACCEPT_UNDER_POLICY']) assert.ok(events.includes(type));
  return { status: 'verified', dossierDigest: row.dossier_digest, events };
}

async function continuity(db, binding) {
  const key = digest([binding.scope, binding.missionId, binding.workspaceId, binding.agentId]);
  const row = await db.get('SELECT body FROM mission_protocol_continuity WHERE context_key=?', key);
  const state = JSON.parse(row.body);
  assert.equal(state.runId, binding.runId);
  assert.equal(digest(state.actor), digest(binding.actor));
  const folder = path.join(path.dirname(binding.directory), `continuity-${key.slice(7)}`);
  return sqlite(path.join(folder, 'fence.sqlite'), store => {
    const authorities = store.prepare('SELECT authority FROM continuity_resource_authorities').all().map(r => JSON.parse(r.authority));
    assert.ok(authorities.some(a => digest(a.owner) === digest(binding.actor) && a.generation === state.generation));
    const effects = store.prepare('SELECT COUNT(*) AS n FROM continuity_resource_effects').get().n;
    assert.ok(effects > 0, 'Continuity must have fenced actual execution events.');
    return { status: 'verified', generation: state.generation, fencedEffects: effects, stateDigest: digest(state) };
  });
}

async function omega(db, binding) {
  const rows = await db.all("SELECT * FROM mission_protocol_receipts WHERE run_id=? AND protocol='OMEGA'", binding.runId);
  assert.ok(rows.length > 0, 'OMEGA must contain actual executed program receipts.');
  const receipts = rows.map(row => {
    const receipt = JSON.parse(row.receipt_json);
    assert.equal(digest(receipt), row.receipt_digest);
    assert.equal(receipt.result.status, 'completed');
    assert.equal(receipt.result.runtimeResult.status, 'emitted');
    return { point: row.point, digest: row.receipt_digest, planDigest: receipt.result.planDigest };
  });
  return { status: 'verified', executedPrograms: receipts.length, receipts };
}

function synapse(binding) {
  return sqlite(path.join(binding.directory, 'synapse.sqlite'), store => {
    const documents = store.prepare('SELECT * FROM synapse_documents').all();
    const document = documents.find(r => JSON.parse(r.value_json).runId === binding.runId);
    assert.ok(document);
    const value = JSON.parse(document.value_json);
    assert.equal(document.state_digest, digest(value));
    assert.equal(value.task, binding.mission.prompt);
    assert.equal(value.missionId, binding.missionId);
    const receipts = store.prepare('SELECT body_json FROM synapse_state_receipts').all().map(r => JSON.parse(r.body_json));
    const receipt = receipts.find(r => r.conversationId === binding.runId);
    assert.equal(receipt.status, 'applied');
    assert.equal(receipt.resultDigest, document.state_digest);
    assert.equal(digest(receipt.receiver), digest(binding.actor));
    const events = store.prepare('SELECT message_json FROM synapse_conversation_events ORDER BY sequence').all()
      .map(r => JSON.parse(r.message_json).type);
    for (const type of ['DECLARE_CONTEXT', 'OFFER_DELTA', 'APPLY_DELTA']) assert.ok(events.includes(type));
    return { status: 'verified', stateDigest: document.state_digest, receiptDigest: receipt.receiptDigest, events };
  });
}

function allostasis(binding) {
  return sqlite(path.join(binding.directory, 'allostasis.sqlite'), store => {
    const row = store.prepare('SELECT body FROM mission_time_runtime WHERE id=?').get(binding.runId);
    const state = JSON.parse(row.body), final = state.finished;
    assert.equal(state.query.missionId, binding.missionId);
    assert.equal(state.query.conversationId, binding.runId);
    assert.equal(final.result.status, 'usage_recorded');
    assert.equal(final.released.status, 'allocation_closed');
    assert.equal(final.result.unknownExposure, 0);
    assert.equal(final.released.held, 0);
    assert.equal(final.result.overBudget, false);
    assert.ok(final.result.spent >= 0 && final.result.spent <= state.amount);
    const receipt = JSON.parse(store.prepare('SELECT body FROM mission_time_receipts WHERE id=?')
      .get(`${binding.runId}:quiescent-time`).body);
    assert.equal(digest(receipt), final.receiptDigest);
    return { status: 'verified', measuredMilliseconds: final.result.spent,
      grantedMilliseconds: state.amount, releasedMilliseconds: final.released.released, receiptDigest: final.receiptDigest };
  });
}

async function gqwf(db, binding) {
  assert.equal(binding.mission.executionPolicy.allowFileEdits, false, 'This qualification covers read-only workspace exchange.');
  const session = await db.get('SELECT * FROM gqwf_execution_sessions WHERE execution_run_id=?', binding.runId);
  assert.ok(session, 'A real GQWF execution session must exist.');
  const state = await require('../missionProtocols/gqwfStore').read(db, binding.runId);
  assert.ok(state?.baseWorld && state.candidateWorld, 'Both CAS worlds must have been exchanged.');
  const rows = await db.all("SELECT * FROM mission_protocol_receipts WHERE run_id=? AND protocol='GQWF'", binding.runId);
  const receipts = rows.map(row => {
    const receipt = JSON.parse(row.receipt_json);
    assert.equal(digest(receipt), row.receipt_digest);
    assert.equal(receipt.result.missionId, binding.missionId);
    return receipt;
  });
  for (const point of ['base-world', 'candidate-world']) assert.equal(receipts.find(r => r.point === point)?.result.status, 'verified');
  assert.equal(state.candidateReceipt.rootHash, session.candidate_hash);
  assert.equal(state.baseReceipt.rootHash, session.base_hash);
  return { status: 'verified', nativeSessionState: session.status, baseRoot: session.base_hash,
    candidateRoot: session.candidate_hash, receipts, headPublicationRequired: false,
    scope: 'actual CAS exchange of the read-only input workspace; no source-code modification claimed' };
}

async function audit(db, runId) {
  const binding = await require('../missionProtocols/context').load(db, runId);
  assert.ok(binding);
  await require('../missionEnvelopeAuthority').assertCompletedRunEvidence(db,
    { agentId: binding.agentId, runId });
  return { EVIDENCE: await evidence(db, binding), CONTINUITY: await continuity(db, binding),
    OMEGA: await omega(db, binding), SYNAPSE: synapse(binding), ALLOSTASIS: allostasis(binding), GQWF: await gqwf(db, binding) };
}

module.exports = { audit };
