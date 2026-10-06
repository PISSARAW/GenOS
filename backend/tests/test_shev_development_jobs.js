'use strict';

const assert = require('node:assert/strict');
const fixture = require('./ontogenesisFixture');
const authority = require('./shevFixture').authority();
const store = require('../src/services/ontogenesis/projectStore');
const responsibilities = require('../src/services/shev/responsibilityService');
const { recordObservation } = require('../src/services/shev/observationService');
const { compilePending } = require('../src/services/shev/initiativeService');
const jobs = require('../src/services/shev/developmentJobService');
const ledger = require('../src/services/gvxDevelopmentLedger');

const projectId = 'shev-development-jobs';
const scope = { projectId, organizationId: 'org-test', entityId: 'agent-test' };
const hash = letter => letter.repeat(64);
const mandate = { purpose: 'Transfer tests', autoDiagnose: false, autoInstrument: false,
  dimensions: [{ name: 'quality', expected: 'Transfer', acceptance: ['Heldout proofs.'] }] };

function authorize(operation, subjectId, details) {
  return authority.authorize({ projectId, expectedVersion: 2, operation, subjectId, details });
}

async function setup(db) {
  await store.createProject(db, { id: projectId, rootPath: 'C:/test', branch: 'codex/ontogenesis',
    objective: 'Transfer tests', config: fixture.testConfig() });
  await responsibilities.registerResponsibility(db, { projectId, authorityRef: 'test', mandate, authorityPublicKey: authority.publicKey });
  await responsibilities.reviseResponsibility(db, { projectId, expectedVersion: 1, mandate, stage: 'assisted',
    authorization: authority.authorize({ projectId, expectedVersion: 1, operation: 'mandate-revision',
      subjectId: projectId, details: { mandate, stage: 'assisted' } }) });
}

async function approve(db, observationId) {
  await recordObservation(db, { id: observationId, projectId, domain: 'application-contract', dimension: 'quality',
    kind: 'capability_gap', epistemicStatus: 'observed', source: 'test:probe', observedAt: new Date().toISOString(),
    summary: 'Capability gap', evidenceRefs: [`artifact:${observationId}`] });
  await compilePending(db, { projectId });
  const initiative = await db.get('SELECT * FROM shev_initiatives WHERE observation_id = ?', [observationId]);
  const input = { ...scope, initiativeId: initiative.id,
    budget: { usd: 1, seconds: 30, deadlineAt: new Date(Date.now() + 3600000).toISOString() } };
  const details = jobs.developmentDetails(input);
  const authorization = authorize('development-approval', initiative.id, details);
  await assert.rejects(jobs.approveDevelopment(db, { ...input, entityId: 'different-agent', authorization }), /signature/);
  await jobs.approveDevelopment(db, { ...input, authorization });
  return initiative;
}

async function transferReceipt(db, initiative) {
  const transfer = { contextHash: hash('a'), state: 'monitored', sourceObservationId: initiative.observation_id,
    trainingContextHashes: [hash('a')], trainingManifestHash: hash('f'), trialEvidence: [],
    monitoring: { windows: [{ contextHash: hash('b'), artifactHash: hash('d') }, { contextHash: hash('c'), artifactHash: hash('e') }] },
    verifiedEvidence: [{ verified: true, artifactHash: hash('d') }, { verified: true, artifactHash: hash('e') }] };
  const event = await ledger.appendEvent(db, { ...scope, id: `transfer:${initiative.observation_id}`, type: 'transfer_recorded', payload: { transfer } });
  return { gvxEventId: event.id, spentUsd: 0.1, seconds: 0.1, evidenceRefs: ['artifact:experiment'] };
}

async function verify({ windows }) {
  return { verifierRef: 'independent-test-verifier', trainingManifestHash: hash('f'),
    cases: windows.map(window => ({ contextHash: window.contextHash, baseline: 0.4, candidate: 0.8,
      direction: 'higher', regression: false, evidenceRefs: [`artifact:${window.contextHash}`] })) };
}

async function testSuccess(db) {
  const initiative = await approve(db, 'gap-success');
  let executions = 0;
  const input = { projectId, initiativeId: initiative.id, verify, perform: async context => {
    assert.equal(context.scope.entityId, scope.entityId);
    assert.equal(context.idempotencyKey, initiative.id);
    assert.equal(context.request.promotionAllowed, false);
    executions += 1;
    return transferReceipt(db, initiative);
  } };
  const result = await jobs.executeDevelopment(db, input);
  assert.equal(result.progress.result, 'confirmed');
  assert.equal(result.experimentalCreditIsProjectBenefit, false);
  assert.equal((await db.get('SELECT * FROM shev_development_jobs WHERE initiative_id = ?', [initiative.id])).status, 'completed');
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM shev_effects')).n, 0);
  await assert.rejects(jobs.executeDevelopment(db, input), /not approved/);
  assert.equal(executions, 1);
}

async function testCrash(db) {
  const initiative = await approve(db, 'gap-crash');
  let executions = 0;
  let receipt;
  const input = { projectId, initiativeId: initiative.id, verify, perform: async () => {
    executions += 1;
    receipt = await transferReceipt(db, initiative);
    throw new Error('Disconnect after experiment.');
  } };
  assert.equal((await jobs.executeDevelopment(db, input)).reconciliationRequired, true);
  await assert.rejects(jobs.executeDevelopment(db, input), /not approved/);
  const reconciled = await jobs.reconcileDevelopment(db, { projectId, initiativeId: initiative.id,
    inspect: async () => receipt, verify,
    authorization: authorize('development-reconciliation', initiative.id, { gvxEventId: receipt.gvxEventId }) });
  assert.equal(reconciled.progress.result, 'confirmed');
  assert.equal(executions, 1);
  await assert.rejects(jobs.reconcileDevelopment(db, { projectId, initiativeId: initiative.id }), /not awaiting/);
}

async function testRevocation(db) {
  const initiative = await approve(db, 'gap-revoked');
  const receipt = await transferReceipt(db, initiative);
  const result = await jobs.executeDevelopment(db, { projectId, initiativeId: initiative.id,
    perform: async () => receipt, verify: async context => {
      await db.run("UPDATE ontogenesis_control SET mode = 'paused' WHERE project_id = ?", [projectId]);
      return verify(context);
    } });
  assert.equal(result.reconciliationRequired, true);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM shev_agent_progress WHERE initiative_id = ?', [initiative.id])).n, 0);
  await db.run("UPDATE ontogenesis_control SET mode = 'running' WHERE project_id = ?", [projectId]);
  const reconciled = await jobs.reconcileDevelopment(db, { projectId, initiativeId: initiative.id,
    inspect: async () => receipt, verify,
    authorization: authorize('development-reconciliation', initiative.id, { gvxEventId: receipt.gvxEventId }) });
  assert.equal(reconciled.progress.result, 'confirmed');
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    await setup(db);
    await testSuccess(db);
    await assert.rejects(db.run("UPDATE shev_development_jobs SET budget_json = '{}'"), /immutable/);
    await testCrash(db);
    await testRevocation(db);
    await assert.rejects(db.run('DELETE FROM shev_agent_progress'), /immutable/);
    console.log('SHEV signed development jobs, heldout progress, crash reconciliation and no replay passed.');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
