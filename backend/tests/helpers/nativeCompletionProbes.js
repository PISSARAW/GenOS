'use strict';

const assert = require('node:assert/strict');
const journal = require('../../src/services/epistemic/nativeOracleJournal');
const gate = require('../../src/services/epistemic/nativeOracleGate');
const proofs = require('../../src/services/epistemic/nativeOracleProof');

async function qualify(db, input) {
  const { request, authority, attestation } = input;
  const scope = authority.envelope.scope;
  const reference = { eventId: attestation.eventId, hash: attestation.hash };
  await assert.rejects(proofs.read(db, { ...request, scope, reference: { ...reference, hash: '0'.repeat(64) } }),
    { code: 'ORACLE_ATTESTATION_REFERENCE_INVALID' });
  await assert.rejects(proofs.read(db, { ...request, agentId: 'delegation-root', scope, reference }),
    { code: 'ORACLE_ATTESTATION_SCOPE_MISMATCH' });
  const proof = await proofs.read(db, { ...request, scope, reference });
  const report = await journal.observationReport(db, request.runId);
  const changed = structuredClone(report);
  changed.workerArtifact.content.result.sum++;
  await assert.rejects(proofs.assertCurrent(db, { proof, request, report: changed }), { code: 'ORACLE_COMPLETION_RESULT_CHANGED' });
  const records = await require('../../src/services/biologicalWorkerStore').observations(db, request.runId);
  const terminal = records.find(item => item.event.eventType === 'AGENT_COMPLETED');
  const row = await db.get('SELECT * FROM strategy_execution_runs WHERE id=?', request.runId);
  await assert.rejects(gate.context(db, { row, event: terminal.event }), { code: 'receipt_replay' });
  const accepted = await gate.historical(db, { ...request, event: terminal.event });
  assert.equal(accepted.acceptance.value.status, 'completed');
  const nativeView = await require('../../src/services/epistemic/nativeOracleInspection').inspect(db, request);
  assert.equal(nativeView.status, 'accepted_at_decision');
  assert.equal(nativeView.current.satisfied, true);
  assert.equal(nativeView.promotionAllowed, false);
  await expiredView(db, { request, proof, report, terminal });
  console.log('Native references reject mutation, owner changes and replay; expiration preserves historical decision.');
}

async function expiredView(db, input) {
  const clock = Date.now;
  Date.now = () => Date.parse(input.proof.attestation.value.validUntil) + 1;
  try {
    await assert.rejects(proofs.assertCurrent(db, input), { code: 'EXECUTION_AUTHORITY_EXPIRED' });
    const view = await require('../../src/services/epistemic/nativeOracleInspection').inspect(db, input.request);
    assert.equal(view.status, 'accepted_at_decision');
    assert.equal(view.current.satisfied, false);
    assert.equal((await gate.historical(db, { ...input.request, event: input.terminal.event })).acceptance.value.status, 'completed');
  } finally { Date.now = clock; }
}

async function promotionRefusals(db, input) {
  const service = require('../../src/services/strategyExecutionService');
  const report = await journal.observationReport(db, input.row.id);
  const workspace = await db.get('SELECT workspace_id FROM agents WHERE id=?', input.row.agent_id);
  await db.run("INSERT INTO projects (id,organization_id,name) VALUES ('native-foreign-project','delegation-org','Foreign scope')");
  await db.run("UPDATE workspaces SET project_id='native-foreign-project' WHERE id=?", workspace.workspace_id);
  try { await assert.rejects(service.approveRun(db, input.row.id, { ...input.options, report }), { code: 'ORACLE_ATTESTATION_SCOPE_MISMATCH' }); }
  finally { await db.run("UPDATE workspaces SET project_id='delegation-project' WHERE id=?", workspace.workspace_id); }
  const authority = await require('../../src/services/missionEnvelopeAuthority').read(db, input.row.id);
  const clock = Date.now;
  Date.now = () => Date.parse(authority.envelope.expiresAt) + 1;
  try { await assert.rejects(service.approveRun(db, input.row.id, input.options), { code: 'EXECUTION_AUTHORITY_EXPIRED' }); }
  finally { Date.now = clock; }
  assert.equal((await db.get('SELECT status FROM strategy_execution_runs WHERE id=?', input.row.id)).status, 'awaiting_approval');
  assert.equal(await db.get('SELECT run_id FROM promotion_execution_journal WHERE run_id=?', input.row.id), undefined);
}

module.exports = { qualify, promotionRefusals };
