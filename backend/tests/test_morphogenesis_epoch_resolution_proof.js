'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('./helpers/biologyDatabase');
const verifierReceipts = require('../src/services/ontogenesis/missionVerifierReceiptService');
const { sealTransitionReceipt } = require('../src/services/morphogenesis/morphogenesisTransitionReceipt');
const { inspectEpochEvidence, proofDigest } = require('../src/services/morphogenesis/morphogenesisEpochEvidence');
const { stopMorphogenesisEpochs } = require('../src/services/morphogenesis/morphogenesisEpochCoordinator');
const recovery = require('../src/services/morphogenesis/morphogenesisEpochRecovery');
const epochStore = require('../src/services/morphogenesis/morphogenesisEpochStore');

const MISSION_ID = 'resolution-proof-mission';
const CHECKS = [{ program: process.execPath, args: ['-e', 'process.exit(0)'] }];
let checkpointIndex = 0;

async function main() {
  const db = openDatabase();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-resolution-proof-'));
  execFileSync('git', ['init'], { cwd: workspaceRoot, stdio: 'ignore' });
  try {
    const valid = await verifiedFixture(workspaceRoot, 'match');
    const evidence = await inspectEpochEvidence(valid.state, MISSION_ID);
    assert.equal(evidence.reason, 'verified_resolution');
    assertProofIdentity(evidence.payload.verifiedResolutionProof, valid.transition);
    stopAsResolved(valid.state, evidence.payload);
    await persistAndCheck(db, valid.state, 'resolved');

    const absent = await verifiedFixture(workspaceRoot, null);
    const absentEvidence = await inspectEpochEvidence(absent.state, MISSION_ID);
    assert.notEqual(absentEvidence.reason, 'verified_resolution');
    stopAsVerifiedButInvalid(absent.state, {});
    await persistAndCheck(db, absent.state, 'stopped');

    const mismatch = await verifiedFixture(workspaceRoot, 'another-transition');
    const mismatchEvidence = await inspectEpochEvidence(mismatch.state, MISSION_ID);
    assert.notEqual(mismatchEvidence.reason, 'verified_resolution');
    const forgedProof = evidence.payload.verifiedResolutionProof;
    const { proofDigest: ignored, ...proofBody } = forgedProof;
    const divergentProof = { ...proofBody, transitionId: 'another-transition' };
    divergentProof.proofDigest = proofDigest(divergentProof);
    stopAsVerifiedButInvalid(mismatch.state, { verifiedResolutionProof: divergentProof });
    await persistAndCheck(db, mismatch.state, 'stopped');
  } finally {
    await db.close();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
  console.log('Morphogenesis terminal resolution proof is retained only for the matching verified transition.');
}

async function verifiedFixture(workspaceRoot, receiptTransition) {
  const worker = { agentId: 'resolution-verifier', workerKind: 'scout_cell',
    morphologyTopology: 'biocenose', morphologyVariant: 'default' };
  const normalizedMission = { missionId: MISSION_ID, prompt: 'verify resolved artifact',
    workspaceRoot, verifierChecks: CHECKS };
  const plan = { morphologyPatch: { graph: { graphId: 'resolution-graph', version: 2,
    nodes: [{ nodeId: 'root' }] } } };
  const adaptation = { receipt: { candidateId: 'resolution-candidate' }, plan,
    admission: { status: 'admitted', selectionBasis: 'verified_test',
      recipe: { id: 'resolution-candidate', topology: 'biocenose', variant: 'default' },
      actualPlan: { workerAssignments: [{ workerId: worker.agentId, workerKind: worker.workerKind,
        topology: worker.morphologyTopology, variant: worker.morphologyVariant, tokenBudget: 12 }] } } };
  const inputState = { workers: new Map([[worker.agentId, worker]]), normalizedMission };
  const transition = sealTransitionReceipt({ state: inputState, survivors: [worker], adaptation,
    continuation: { workerTokens: [12], perWorkerTokens: 12 } });
  transition.dispatchStatus = 'queued';
  transition.queuedWorkerIds = [worker.agentId];
  const boundReceiptTransition = receiptTransition === 'match' ? transition.transitionId : receiptTransition;
  const missionReceipt = boundReceiptTransition
    ? await verifierReceipts.createReceipt({ missionId: MISSION_ID, transitionId: boundReceiptTransition,
      workspaceRoot, checks: CHECKS, allowExecution: true, timeoutMs: 10000 }) : null;
  const result = { agentId: worker.agentId, workerKind: worker.workerKind, topology: worker.morphologyTopology,
    variant: worker.morphologyVariant, allocatedTokens: 12, transitionId: transition.transitionId,
    status: 'completed', payload: missionReceipt ? { verifierReceipt: missionReceipt } : {} };
  return { transition, state: { db: null, checkpointScope: null, checkpointRevision: 0,
    orchestratorId: MISSION_ID, normalizedMission, workers: new Map([[worker.agentId, worker]]),
    workerIds: new Set([worker.agentId]), results: new Map([[worker.agentId, result]]), epoch: 1,
    epochBudget: { remaining: 0, reservedEpochs: 0, maxEpochs: 1 }, advanced: true,
    plan: { morphogenesisEpochStatus: { status: 'running', transition } } } };
}

function assertProofIdentity(proof, transition) {
  assert.equal(proof.transitionId, transition.transitionId);
  assert.equal(proof.mission.missionId, MISSION_ID);
  assert.equal(proof.candidateId, transition.identity.candidateId);
  assert.equal(proof.oracleReceipt.transitionId, transition.transitionId);
  assert.equal(proof.verifierWorkerId, 'resolution-verifier');
  assert.deepEqual(proof.verifiedNeedReceipts,
    transition.identity.resourceAllocation?.verifiedNeedReceipts || []);
}

function stopAsResolved(state, payload) {
  stopMorphogenesisEpochs({ state, orchestratorId: MISSION_ID, reason: 'verified_resolution', payload,
    emit: () => {}, autonomousRounds: new Map() });
  assert.equal(state.plan.morphogenesisEpochStatus.status, 'resolved');
  assert.ok(state.plan.morphogenesisEpochStatus.verifiedResolutionProof);
}

function stopAsVerifiedButInvalid(state, payload) {
  stopMorphogenesisEpochs({ state, orchestratorId: MISSION_ID, reason: 'verified_resolution', payload,
    emit: () => {}, autonomousRounds: new Map() });
  assert.equal(state.plan.morphogenesisEpochStatus.status, 'stopped');
  assert.equal(state.plan.morphogenesisEpochStatus.reason, 'resolution_proof_invalid');
  assert.equal(state.plan.morphogenesisEpochStatus.verifiedResolutionProof, undefined);
}

async function persistAndCheck(db, state, expectedStatus) {
  state.db = db;
  checkpointIndex += 1;
  state.checkpointScope = { missionId: `checkpoint-${expectedStatus}-${checkpointIndex}`,
    organizationId: 'org-resolution', projectId: 'project-resolution' };
  await recovery.persistRound(state, `terminal-${expectedStatus}-${state.checkpointScope.missionId}`, expectedStatus);
  const checkpoint = await epochStore.loadCheckpoint(db, state.checkpointScope);
  assert.equal(checkpoint.state.plan.morphogenesisEpochStatus.status, expectedStatus);
  if (expectedStatus === 'resolved') {
    assert.deepEqual(checkpoint.state.plan.morphogenesisEpochStatus.verifiedResolutionProof,
      state.plan.morphogenesisEpochStatus.verifiedResolutionProof);
  } else {
    assert.equal(checkpoint.state.plan.morphogenesisEpochStatus.verifiedResolutionProof, undefined);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
