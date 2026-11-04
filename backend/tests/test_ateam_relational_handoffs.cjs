'use strict';

const assert = require('node:assert/strict');
const fixture = require('./helpers/ateamRelationalNativeFixture.cjs');
const admission = require('../src/services/aTeam/relational/handoffAdmissionService');
const reception = require('../src/services/aTeam/relational/workerHandoffAdmission');
const qualification = require('../src/services/aTeam/relational/handoffQualification');
const store = require('../src/services/aTeam/relational/handoffAdmissionStore');

const input = (context, test, handoffs = [test.handoff]) => ({ db: context.db,
  teamRunId: test.run.teamRunId, runnerToken: test.runnerToken, member: test.member, handoffs });
async function rejects(operation, code) { await assert.rejects(operation, error => error.code === code); }

async function positive(context) {
  const test = await fixture.team(context, 'positive');
  const delivered = await admission.admitHandoffs(input(context, test));
  assert.equal(delivered.length, 1);
  const receipt = await store.readRef(context.db, delivered[0].relationalReceiptRef);
  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.sourceRunId, context.source.runId);
  assert.equal(receipt.semanticAccepted, false);
  assert.equal(receipt.acknowledgment, 'required_from_native_consumer');
  const current = await fixture.receive(context, test, delivered);
  const consumed = await reception.admit(context.db, current);
  assert.equal(consumed.length, 1);
  assert.equal(consumed[0].transportAdmission, true);
  assert.equal(consumed[0].semanticAccepted, false);
  assert.equal(consumed[0].consumerRunId, current.executionRun.id);
  assert.deepEqual(await reception.admit(context.db, current), consumed);
  const unresolved = await qualification.qualify(context.db, { run: test.run, observed: { graph: test.graph } });
  assert.equal(unresolved.passed, false);
  assert.equal(unresolved.reason, 'ATEAM_RPE_ACK_REQUIRED');
  await rejects(reception.admit(context.db, { ...current,
    mission: { ...current.mission, handoffContext: [] } }), 'ATEAM_RPE_HANDOFFS_REQUIRED');
  const withoutRef = { ...delivered[0] }; delete withoutRef.relationalReceiptRef;
  const missing = await fixture.receive(context, test, [withoutRef]);
  await rejects(reception.admit(context.db, missing), 'ATEAM_RPE_HANDOFF_CHANGED');
  const replay = await fixture.receive(context, test, delivered);
  await rejects(reception.admit(context.db, replay), 'ATEAM_RPE_RECEIPT_REPLAY');
  return { test, delivered, current };
}

async function changes(context, result) {
  const { test, delivered } = result;
  const changed = { ...test.handoff, artifactPayload: { substituted: true } };
  await rejects(admission.admitHandoffs(input(context, test, [changed])), 'ATEAM_RPE_HANDOFF_CHANGED');
  await rejects(admission.admitHandoffs({ ...input(context, test), runnerToken: 'foreign-runner' }), 'ATEAM_RUN_LEASE_LOST');
  const teams = require('../src/services/aTeam/teamRunStore');
  const stored = await teams.load(context.db, test.run.teamRunId);
  await rejects(teams.update({ db: context.db, teamRunId: stored.teamRunId,
    revision: stored.revision, patch: { relationalPolicy: null } }), 'ATEAM_RPE_POLICY_CHANGED');
  const newSource = await require('../src/services/strategyExecutionService').createExecutionRun(context.db, {
    agentId: context.source.workerId, missionId: context.id,
    contractRecord: await require('../src/services/strategyContractService').getLatestContract(context.db, context.id),
    budget: { tokens: 0, deterministic: true, latencyMs: 180000 } });
  assert.notEqual(newSource.id, context.source.runId);
  const receiver = await fixture.receive(context, test, delivered);
  await rejects(reception.admit(context.db, receiver), 'ATEAM_RPE_SOURCE_SUPERSEDED');
}

async function restrictions(context) {
  const blind = await fixture.team(context, 'blind');
  await context.db.run(`INSERT INTO agent_relations(id,source_agent_id,target_agent_id,relation_type,organization_id,project_id,metadata_json)
    VALUES(?,?,?,?,?,?,?)`, 'rpe-blind', context.source.workerId, blind.target.agentId, 'verifier', context.id, context.id, '{}');
  await rejects(admission.admitHandoffs(input(context, blind)), 'ATEAM_RPE_HANDOFF_REPLAN_REQUIRED');
  const denied = await context.db.get('SELECT body_json FROM ateam_relational_admissions WHERE team_run_id=?', blind.run.teamRunId);
  assert.equal(JSON.parse(denied.body_json).status, 'denied');
  assert.ok(JSON.parse(denied.body_json).decision.plan.redactedRefIds.includes('claims'));
  const quarantined = await fixture.team(context, 'quarantined');
  await context.db.run("UPDATE agents SET isolation_mode='Quarantine' WHERE id=?", quarantined.target.agentId);
  await rejects(admission.admitHandoffs(input(context, quarantined)), 'ATEAM_RPE_HANDOFF_REPLAN_REQUIRED');
  const foreign = await fixture.team(context, 'foreign');
  await context.db.run("INSERT INTO organizations(id,name) VALUES('rpe-foreign','Foreign')");
  await context.db.run("INSERT INTO projects(id,organization_id,name) VALUES('rpe-foreign','rpe-foreign','Foreign')");
  await context.db.run("INSERT INTO workspaces(id,name,path,organization_id,project_id) VALUES('rpe-foreign','Foreign',?,'rpe-foreign','rpe-foreign')", context.workspace);
  await context.db.run("UPDATE agents SET workspace_id='rpe-foreign' WHERE id=?", foreign.target.agentId);
  await rejects(admission.admitHandoffs(input(context, foreign)), 'ATEAM_RPE_SCOPE_MISMATCH');
}

async function main() {
  const context = await fixture.create();
  try {
    const result = await positive(context);
    await restrictions(context);
    await changes(context, result);
    console.log('A-Team RPE: real native accepted source; admission and transport consumption; no fabricated ACK; replay, source, tenant, blind relation and quarantine refusals passed.');
  } finally { await context.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
