'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const snapshots = require('./workspaceSnapshotStore');
const {manifestHash} = require('./workspaceSnapshotCollect');
const {resolveContainedPathNoSymlinkSync} = require('./pathSafety');
const authority = require('./missionEnvelopeAuthority');
const journal = require('./epistemic/nativeOracleJournal');
const {digest} = require('./biologicalIntegrity');

async function execute(input) {
  const {db, mission, event} = input;
  const runId = event.payload.executionRunId;
  const qualityEvidence = qualityReplayEvidence({mission, report: event.payload.evidenceReport});
  const saved = await authority.assertRun(db, {agentId: mission.agentId, runId});
  const owner = await db.get('SELECT w.* FROM agents a JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=?', mission.agentId);
  if (!await require('./agents/workerContractEnforcement').ownsReplaySnapshot({db,
    agentId: mission.agentId, reference: event.payload.snapshot, suppliedRoot: mission.workspaceRoot})) {
    throw Error('WORKER_REPLAY_SNAPSHOT_SCOPE_DENIED');
  }
  const snapshot = await snapshots.capture({db, workspace: owner, sourcePath: mission.workspaceRoot,
    agentId: mission.agentId, label: 'Pre-promotion code replay', reason: runId});
  const stored = await snapshots.getSnapshot(db, owner.id, snapshot.id);
  const root = resolveContainedPathNoSymlinkSync(owner.path, '.genos/replay-verification', 'code replay');
  await fs.mkdir(root, {recursive: true});
  const replayRoot = await fs.mkdtemp(path.join(root, 'run-'));
  const started = Date.now();
  try {
    await snapshots.materialize(stored, replayRoot);
    const stateDigest = snapshot.snapshotHash;
    if (manifestHash(await snapshots.collectFiles(replayRoot)) !== stateDigest) throw Error('WORKER_REPLAY_APPLY_MISMATCH');
    const tests = await replayTests({mission, event, replayRoot, qualityEvidence});
    const liveDigest = manifestHash(await snapshots.collectFiles(replayRoot));
    if (liveDigest !== stateDigest || manifestHash(await snapshots.collectFiles(mission.workspaceRoot)) !== stateDigest) {
      throw Error('WORKER_REPLAY_STATE_CHANGED');
    }
    const record = {schema: qualityEvidence ? 'genos.worker-evidence-replay/v1' : 'genos.worker-code-replay/v1',
      agentId: mission.agentId, runId,
      snapshotId: snapshot.id, stateDigest, liveDigest, success: true, applied: true,
      replayVerified: true, replayStatus: 'verified', tests, runtimeMs: Date.now() - started,
      authorityHash: saved.hash, reportHash: digest(event.payload.evidenceReport),
      ...(qualityEvidence ? {verification: qualityEvidence} : {}),
      chainProof: input.chainProof};
    await journal.append(db, {kind: qualityEvidence ? 'evidence-replay' : 'code-replay',
      scope: saved.envelope.scope, record});
    return record;
  } finally {await fs.rm(replayRoot, {recursive: true, force: true});}
}

async function replayTests({mission, event, replayRoot}) {
  const report = event.payload.evidenceReport || {};
  const commands = testCommands(report);
  const local = require('./localCodeWorkerService');
  if (!commands.length) return replayWithoutCommands({mission, report});
  if (commands.length > 2) throw Error('WORKER_REPLAY_TESTS_MISSING');
  return runCommands({commands, local, mission, replayRoot});
}

function testCommands(report) {
  return [...new Set((report.tests || []).map(test => test?.command)
    .filter(command => typeof command === 'string' && command.trim()))];
}

function replayWithoutCommands(input) {
  if (qualityReplayEvidence(input)) return [];
  throw Error('WORKER_REPLAY_TESTS_MISSING');
}

async function runCommands({commands, local, mission, replayRoot}) {
  const tests = [];
  for (const command of commands) {
    if (!local.allowedTest(command, mission.executionPolicy?.allowedCommands)) throw Error('WORKER_REPLAY_TEST_FORBIDDEN');
    const result = await local.runTest(command, replayRoot);
    if (result.exitCode !== 0 || result.timedOut) throw Error('WORKER_REPLAY_TEST_FAILED');
    tests.push(result);
  }
  return tests;
}

function qualityReplayEvidence({mission, report}) {
  if (report?.workerArtifact?.type !== 'creative_candidate' || !report.qualityElevationReceipt) return null;
  const artifact = report.workerArtifact;
  const text = require('./qualityElevation/workerQualityContractEnforcer').extractTargetContent(report, artifact);
  const evaluation = require('./qualityElevation/qualityReceiptIntegrity').assertReceipt(
    report.qualityElevationReceipt, {worker: mission, text, artifact});
  if (evaluation.passed !== true) throw Error('WORKER_REPLAY_QUALITY_RECEIPT_INVALID');
  return {kind: 'native_gqel_quality_review', receiptId: report.qualityElevationReceipt.receiptId,
    receiptDigest: digest(report.qualityElevationReceipt), artifactDigest: evaluation.artifactDigest};
}

module.exports = {execute, replayTests, qualityReplayEvidence};
