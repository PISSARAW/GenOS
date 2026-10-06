'use strict';

const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const { authorizationPayload } = require('../src/services/shev/authorityService');
const { registerResponsibility, reviseResponsibility } = require('../src/services/shev/responsibilityService');
const { recordObservation } = require('../src/services/shev/observationService');
const { compilePending, approveInitiative } = require('../src/services/shev/initiativeService');
const { initiativeEnvelope, clampBudget } = require('../src/services/shev/initiativeAdmissionService');
const { recordProjectEffect } = require('../src/services/shev/effectService');
const { dueWatches, monitorProjectEffect, proposeRecovery,
  approveRecovery, executeRecovery, reconcileRecovery } = require('../src/services/shev/monitoringService');

const keyPair = generateKeyPairSync('ed25519');
const projectId = 'shev-protocols';
const mandate = { purpose: 'Maintenir le service', autoDiagnose: true, autoInstrument: false,
  dimensions: [{ name: 'availability', expected: 'Disponible', acceptance: ['La sonde reussit.'] }] };
const expiresAt = new Date(Date.now() + 3600000).toISOString();
let sequence = 0;

function authorization(input) {
  sequence += 1;
  const nonce = `shev-protocol-test-${sequence.toString().padStart(4, '0')}`;
  const payload = authorizationPayload({ ...input, projectId, nonce, expiresAt });
  const signature = sign(null, Buffer.from(JSON.stringify(payload)), keyPair.privateKey).toString('base64');
  return { nonce, expiresAt, signature };
}

function observation(id, kind, at) {
  return { id, projectId, domain: 'application-contract', dimension: 'availability', kind,
    epistemicStatus: 'observed', source: 'independent-probe', observedAt: new Date(at).toISOString(),
    summary: `Observation ${id}`, evidenceRefs: [`artifact:${id}`] };
}

async function setup(db) {
  await store.createProject(db, { id: projectId, rootPath: 'C:/test', branch: 'codex/ontogenesis',
    objective: 'Maintenir le service', config: fixture.testConfig() });
  await registerResponsibility(db, { projectId, authorityRef: 'owner:test', mandate,
    authorityPublicKey: keyPair.publicKey.export({ type: 'spki', format: 'pem' }) });
}

async function testRevision(db) {
  await recordObservation(db, observation('old-diagnostic', 'degradation', Date.now() - 25000));
  await compilePending(db, { projectId });
  const old = await db.get("SELECT * FROM shev_initiatives WHERE observation_id = 'old-diagnostic'");
  assert.equal(old.status, 'queued');
  const weaker = { ...mandate, dimensions: [{ ...mandate.dimensions[0], acceptance: ['Autre test.'] }] };
  await assert.rejects(reviseResponsibility(db, { projectId, expectedVersion: 1, stage: 'assisted',
    mandate: weaker, authorization: authorization({ operation: 'mandate-revision',
      subjectId: projectId, expectedVersion: 1, details: { mandate: weaker, stage: 'assisted' } }) }), /cannot lower/);
  const stronger = { ...mandate, dimensions: [{ ...mandate.dimensions[0],
    acceptance: ['La sonde reussit.', 'La reprise est verifiee.'] }] };
  const signed = authorization({ operation: 'mandate-revision', subjectId: projectId,
    expectedVersion: 1, details: { mandate: stronger, stage: 'assisted' } });
  await assert.rejects(reviseResponsibility(db, { projectId, expectedVersion: 1,
    stage: 'delegated', mandate: stronger, authorization: signed }), /signature is invalid/);
  const revised = await reviseResponsibility(db, { projectId, expectedVersion: 1,
    stage: 'assisted', mandate: stronger, authorization: signed });
  assert.equal(revised.mandateVersion, 2);
  assert.equal(revised.stage, 'assisted');
  assert.equal((await initiativeEnvelope(db, { id: old.task_id })).blocked, 'shev-mandat-revise');
  await assert.rejects(reviseResponsibility(db, { projectId, expectedVersion: 1,
    stage: 'assisted', mandate: stronger, authorization: signed }), /stale/);
}

async function testApproval(db) {
  await recordObservation(db, observation('risk-1', 'risk', Date.now() - 20000));
  await compilePending(db, { projectId });
  const initiative = await db.get("SELECT * FROM shev_initiatives WHERE observation_id = 'risk-1'");
  assert.equal(initiative.status, 'proposed');
  const budget = { tokens: 1000, usd: 0.1, seconds: 30, maxAttempts: 1,
    deadlineAt: new Date(Date.now() + 3600000).toISOString() };
  const details = { budget, stopCondition: 'on-failed-check', alternative: 'Conserver la configuration actuelle.' };
  const authorizationInput = authorization({ operation: 'initiative-approval',
    subjectId: initiative.id, expectedVersion: 2, details });
  await assert.rejects(approveInitiative(db, { projectId, initiativeId: initiative.id,
    ...details, alternative: 'Changer sans revue.', authorization: authorizationInput }), /signature is invalid/);
  const approved = await approveInitiative(db, { projectId, initiativeId: initiative.id,
    ...details, authorization: authorizationInput });
  assert.equal(approved.status, 'queued');
  const task = await db.get('SELECT * FROM ontogenesis_backlog WHERE id = ?', [approved.task_id]);
  const envelope = await initiativeEnvelope(db, task);
  assert.equal(envelope.budget.maxAttempts, 1);
  assert.deepEqual(clampBudget({ tokens: 40000, usd: 0.25, seconds: 120 }, envelope),
    { tokens: 1000, usd: 0.1, seconds: 30 });
  assert.equal((await initiativeEnvelope(db, { ...task, attempt: 1 })).blocked, 'shev-condition-arret');
  return approved;
}

async function testMonitoring(db, approved) {
  await db.run("UPDATE ontogenesis_backlog SET status = 'done' WHERE id = ?", [approved.task_id]);
  await recordObservation(db, observation('after-1', 'state', Date.now() - 10000));
  await recordProjectEffect(db, { projectId, initiativeId: approved.id, postObservationId: 'after-1',
    verify: async () => ({ result: 'confirmed', verifierRef: 'independent-check',
      evidenceRefs: ['artifact:after-1'] }) });
  assert.equal((await dueWatches(db, Date.now() + 90000000)).length, 1);
  await recordObservation(db, observation('regression-1', 'degradation', Date.now()));
  const monitoring = await monitorProjectEffect(db, { projectId,
    initiativeId: approved.id, observationId: 'regression-1',
    verify: async () => ({ result: 'regressed', verifierRef: 'independent-monitor',
      evidenceRefs: ['artifact:regression-1'] }) });
  assert.equal(monitoring.result, 'regressed');
  assert.equal((await dueWatches(db, Date.now() + 90000000)).length, 0);
  const plan = { actionRef: 'business-rollback:v1', budgetUsd: 0.2, maxSeconds: 60,
    deadlineAt: expiresAt, stopCondition: 'on-regression', alternative: 'Escalade humaine.' };
  await proposeRecovery(db, { projectId, monitoringId: monitoring.id, plan });
  const signed = authorization({ operation: 'recovery-approval',
    subjectId: monitoring.id, expectedVersion: 2, details: plan });
  const approvedRecovery = await approveRecovery(db, { projectId,
    monitoringId: monitoring.id, authorization: signed });
  assert.equal(approvedRecovery.status, 'approved');
  const result = await executeRecovery(db, { monitoringId: monitoring.id,
    perform: async ({ plan: authorizedPlan }) => ({ result: 'applied',
      externalReceiptRef: authorizedPlan.actionRef, evidenceRefs: ['artifact:rollback'],
      spentUsd: 0.1, seconds: 12 }) });
  assert.equal(result.status, 'applied');
  await assert.rejects(executeRecovery(db, { monitoringId: monitoring.id,
    perform: async () => { throw new Error('must not replay'); } }), /not approved/);
  await recordObservation(db, observation('regression-2', 'degradation', Date.now()));
  const again = await monitorProjectEffect(db, { projectId, initiativeId: approved.id,
    observationId: 'regression-2', verify: async () => ({ result: 'regressed',
      verifierRef: 'independent-monitor', evidenceRefs: ['artifact:regression-2'] }) });
  await proposeRecovery(db, { projectId, monitoringId: again.id, plan });
  await approveRecovery(db, { projectId, monitoringId: again.id,
    authorization: authorization({ operation: 'recovery-approval', subjectId: again.id,
      expectedVersion: 2, details: plan }) });
  const ambiguous = await executeRecovery(db, { monitoringId: again.id, perform: async () => ({ result: 'applied' }) });
  assert.equal(ambiguous.reconciliationRequired, true);
  const inspected = { result: 'applied', externalReceiptRef: 'external:inspected',
    evidenceRefs: ['artifact:inspected'], spentUsd: 0.1, seconds: 1 };
  const reconciled = await reconcileRecovery(db, { projectId, monitoringId: again.id, receipt: inspected,
    authorization: authorization({ operation: 'recovery-reconciliation', subjectId: again.id,
      expectedVersion: 2, details: inspected }),
    verify: async () => ({ verified: true, verifierRef: 'independent-inspector', evidenceRefs: ['artifact:inspected'] }) });
  assert.equal(reconciled.status, 'applied');
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    await setup(db);
    await testRevision(db);
    const approved = await testApproval(db);
    await testMonitoring(db, approved);
    console.log('SHEV authority, approval and recovery checks passed.');
  } finally { await db.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
