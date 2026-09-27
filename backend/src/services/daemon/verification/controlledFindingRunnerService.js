'use strict';

const crypto = require('node:crypto');
const { getSnapshot, runInSnapshot } = require('../../workspaceSnapshotStore');
const { appendEvidence } = require('../findings/findingEvidenceService');

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function loadContext(db, input) {
  const finding = await db.get('SELECT id, territory_id, status FROM daemon_findings WHERE id = ?', input.findingId);
  if (!finding || finding.status !== 'REPRODUCED') throw new Error('A reproduced finding is required.');
  const territory = await db.get('SELECT workspace_id FROM daemon_territories WHERE id = ?', finding.territory_id);
  if (!territory?.workspace_id) throw new Error('Finding territory has no workspace.');
  const baseline = await getSnapshot(db, territory.workspace_id, input.baselineSnapshotId);
  const intervention = await getSnapshot(db, territory.workspace_id, input.interventionSnapshotId);
  if (baseline.id === intervention.id || baseline.snapshot_hash === intervention.snapshot_hash) {
    throw new Error('Two different persisted snapshots are required.');
  }
  return { finding, territory, baseline, intervention };
}

async function runPair(context, command) {
  const options = (snapshot) => ({ snapshot, command, workspacePath: snapshot.workspace_path });
  const baseline = await runInSnapshot(options(context.baseline));
  const intervention = await runInSnapshot(options(context.intervention));
  return { baseline: { exitCode: baseline.exitCode, outputHash: digest(baseline.stdout + baseline.stderr),
    truncated: baseline.truncated },
  intervention: { exitCode: intervention.exitCode,
    outputHash: digest(intervention.stdout + intervention.stderr), truncated: intervention.truncated } };
}

function controlledOutcome(runs) {
  return runs.length >= 2 && runs.every((run) => run.baseline.exitCode > 0
    && run.intervention.exitCode === 0 && !run.baseline.truncated && !run.intervention.truncated);
}

async function storeEvidence(request) {
  const { db, context, input, runs } = request;
  const payload = { apiVersion: 'genos.daemon-controlled-run/v1', findingId: input.findingId,
    workspaceId: context.territory.workspace_id, baselineSnapshotId: context.baseline.id,
    interventionSnapshotId: context.intervention.id,
    initialStateHash: context.baseline.snapshot_hash,
    interventionSnapshotHash: context.intervention.snapshot_hash,
    command: input.command, runs };
  const payloadJson = JSON.stringify(payload);
  const payloadHash = digest(payloadJson);
  const provenanceRecordId = `daemon-causal-${payloadHash}`;
  await db.run(`INSERT OR IGNORE INTO provenance_records
    (id, subject_type, subject_id, payload_hash, payload_json)
    VALUES (?, ?, ?, ?, ?)`, provenanceRecordId, 'daemon_causal_run', input.findingId,
  payloadHash, payloadJson);
  const controls = { baselineSnapshotId: context.baseline.id,
    interventionSnapshotId: context.intervention.id, initialStateHash: context.baseline.snapshot_hash,
    interventionSnapshotHash: context.intervention.snapshot_hash, interventionApplied: true,
    sameEnvironment: true, replicationCount: runs.length, outcomeChanged: true };
  const evidence = await appendEvidence(db, { findingId: input.findingId, side: 'supporting',
    evidenceType: 'causal', description: 'Two isolated baseline failures and intervention recoveries.',
    provenanceRecordId, metadata: { causalControls: controls } });
  if (!evidence.appended) throw new Error(`Causal evidence rejected: ${evidence.errors?.join(',')}`);
  return { provenanceRecordId, evidenceId: evidence.evidenceId };
}

async function runControlledFinding(db, input) {
  if (!input?.findingId || !input?.baselineSnapshotId || !input?.interventionSnapshotId || !input?.command) {
    throw new Error('Finding, snapshots and test command are required.');
  }
  const context = await loadContext(db, input);
  const runs = [];
  for (let attempt = 0; attempt < 2; attempt += 1) runs.push(await runPair(context, input.command));
  if (!controlledOutcome(runs)) return { supported: false, runs };
  return { supported: true, runs, ...await storeEvidence({ db, context, input, runs }) };
}

module.exports = { runControlledFinding };
