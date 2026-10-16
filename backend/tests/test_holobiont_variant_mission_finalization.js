'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { runVariantMission, preflightVariantMission } = require('../src/services/holobionte/variants/variantMissionExecutor');
const snapshots = require('../src/services/topologySnapshotService');
const adapter = require('../src/services/topologySnapshots/holobionte');

snapshots.registerAdapter('holobionte', adapter);

async function fixture() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, project_id TEXT, organization_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT);`);
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?)', 'workspace-1', 'project-1', 'org-1');
  await db.run('INSERT INTO agents VALUES (?, ?)', 'host-1', 'workspace-1');
  return db;
}

function input(overrides = {}) {
  return { missionId: 'mission-1', hostId: 'host-1', workspaceId: 'workspace-1',
    projectId: 'project-1', organizationId: 'org-1', persistentHost: true,
    variantId: 'local-first', fitContext: { localEngineAvailable: true },
    variantOperations: [{ operation: 'planPlacement', runtimeInput: { availableEngines: ['local'] } }],
    evidenceRefs: ['proof:mission-1'], verifyEvaluationEvidence: async () => true,
    verifierIds: ['verifier-a', 'verifier-b'],
    verifyMission: async () => ({ verdict: 'PASS', verifierIds: ['verifier-a', 'verifier-b'],
      assertions: [{ id: 'local-placement', status: 'PASS', evidenceRefs: ['proof:mission-1'] }] }),
    verifyLifecycleEvidence: async (binding) => ({ status: 'VERIFIED', missionId: binding.missionId,
      holobiontId: binding.holobiontId, workflowHash: binding.workflowHash,
      immunePassed: true, verifierId: 'stop-verifier', evidenceRefs: ['proof:mission-1'] }),
    telemetry: { emitEvent: () => ({}) }, ...overrides };
}

async function status(db, result) {
  return (await db.get('SELECT status FROM holobiont_sessions WHERE holobiont_id = ?', result.holobiontId)).status;
}

async function testRejectedOperation() {
  const db = await fixture();
  try {
    const options = input({ variantOperations: [{ operation: 'planPlacement',
      runtimeInput: { availableEngines: [] } }] });
    const result = await runVariantMission(db, options);
    assert.equal(result.workflow.completed[0].result.accepted, false);
    assert.equal(result.verdict, 'FAIL');
    assert.deepEqual(result.failedOperations, ['planPlacement']);
    assert.equal(result.stopped, false);
    assert.equal(await status(db, result), 'ACTIVE');
  } finally { await db.close(); }
}

async function testVerifiedQuiescence() {
  const db = await fixture();
  try {
    const result = await runVariantMission(db, input());
    assert.equal(result.verdict, 'PASS');
    assert.equal(result.lifecycle.disposition, 'QUIESCENT');
    assert.equal(result.stopped, true);
    assert.equal(await status(db, result), 'QUIESCENT');
    const event = await db.get(`SELECT payload_json FROM holobiont_lifecycle_events
      WHERE holobiont_id = ? AND event_type = 'QUIESCENT'`, result.holobiontId);
    assert.equal(JSON.parse(event.payload_json).stopEvidence.verifierId, 'stop-verifier');
    const context = { db, topologyId: 'holobionte', variantId: 'local-first',
      sessionId: result.holobiontId, agentId: 'host-1', workspaceId: 'workspace-1',
      workerKind: 'bounded_worker',
      scope: { clause: 'w.organization_id = ? AND w.project_id = ?', params: ['org-1', 'project-1'] } };
    const manifest = await snapshots.capture(context);
    assert.equal((await snapshots.preflightRestore({ ...context, manifest })).allowed, true);
  } finally { await db.close(); }
}

async function testInvalidProofAndIdentity() {
  const db = await fixture();
  try {
    const invalidProof = await runVariantMission(db, input({ verifyLifecycleEvidence: async (binding) => ({
      status: 'VERIFIED', missionId: binding.missionId, holobiontId: binding.holobiontId,
      workflowHash: 'wrong', immunePassed: true, verifierId: 'stop-verifier',
      evidenceRefs: ['proof:mission-1'] }) }));
    assert.equal(invalidProof.verdict, 'PASS');
    assert.equal(invalidProof.stopped, false);
    assert.deepEqual(invalidProof.lifecycle.reasons, ['STOP_EVIDENCE_INVALID']);
    assert.equal(await status(db, invalidProof), 'ACTIVE');
    await db.run('UPDATE agents SET workspace_id = ? WHERE id = ?', 'other-workspace', 'host-1');
    const identity = await runVariantMission(db, input());
    assert.equal(identity.stopped, false);
    assert.deepEqual(identity.lifecycle.reasons, ['WORKSPACE_IDENTITY_UNVERIFIED']);
    assert.equal(await status(db, identity), 'ACTIVE');
  } finally { await db.close(); }
}

async function testHostCannotVerifyItsOwnMission() {
  const db = await fixture();
  try {
    const verifierIds = ['host-1', 'verifier-b'];
    const options = input({ verifierIds,
      verifyMission: async () => ({ verdict: 'PASS', verifierIds,
        assertions: [{ id: 'local-placement', status: 'PASS', evidenceRefs: ['proof:mission-1'] }] }) });
    const preflight = preflightVariantMission(options);
    assert.equal(preflight.ready, false);
    assert.equal(preflight.verifierCount, 1);
    const result = await runVariantMission(db, options);
    assert.equal(result.verdict, 'INCONCLUSIVE');
    assert.equal(result.stopped, false);
    assert.equal(await status(db, result), 'ACTIVE');
    const actorIds = ['operator-1', 'verifier-b'];
    const actorOptions = input({ actorId: 'operator-1', verifierIds: actorIds,
      verifyMission: async () => ({ verdict: 'PASS', verifierIds: actorIds,
        assertions: [{ id: 'local-placement', status: 'PASS', evidenceRefs: ['proof:mission-1'] }] }) });
    assert.equal(preflightVariantMission(actorOptions).ready, false);
    const actorResult = await runVariantMission(db, actorOptions);
    assert.equal(actorResult.verdict, 'INCONCLUSIVE');
    assert.equal(await status(db, actorResult), 'ACTIVE');
  } finally { await db.close(); }
}

async function main() {
  await testRejectedOperation();
  await testVerifiedQuiescence();
  await testInvalidProofAndIdentity();
  await testHostCannotVerifyItsOwnMission();
  console.log('Holobiont variant mission finalization: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
