'use strict';

const assert = require('node:assert/strict');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const crypto = require('node:crypto');
const gate = require('../src/services/daemon/findings/findingEvidenceGateService');

async function main() {
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE daemon_finding_evidence(id INTEGER, finding_id TEXT, side TEXT,
      evidence_type TEXT, provenance_record_id TEXT, metadata_json TEXT);
    CREATE TABLE daemon_findings(id TEXT, territory_id TEXT);
    CREATE TABLE daemon_territories(id TEXT, workspace_id TEXT);
    CREATE TABLE workspace_snapshots(id TEXT, workspace_id TEXT, snapshot_hash TEXT);
    CREATE TABLE provenance_records(id TEXT, subject_type TEXT, subject_id TEXT,
      payload_hash TEXT, payload_json TEXT);
    INSERT INTO daemon_findings VALUES ('finding.test', 'territory.test');
    INSERT INTO daemon_territories VALUES ('territory.test', 'workspace.test');
  `);
  const baselineHash = 'a'.repeat(64);
  const interventionHash = 'b'.repeat(64);
  await db.run('INSERT INTO workspace_snapshots VALUES (?, ?, ?)',
    'baseline', 'workspace.test', baselineHash);
  await db.run('INSERT INTO workspace_snapshots VALUES (?, ?, ?)',
    'intervention', 'workspace.test', interventionHash);
  const controls = { baselineSnapshotId: 'baseline', interventionSnapshotId: 'intervention',
    initialStateHash: 'c'.repeat(64), interventionSnapshotHash: interventionHash,
    interventionApplied: true, sameEnvironment: true, replicationCount: 2, outcomeChanged: true };
  await db.run('INSERT INTO daemon_finding_evidence VALUES (1, ?, ?, ?, ?, ?)',
    'finding.test', 'supporting', 'causal', 'provenance.test', JSON.stringify({ causalControls: controls }));
  const change = { id: 'finding.test', toStatus: 'CAUSALLY_SUPPORTED' };
  assert.equal(await gate.transitionError(db, change), 'controlled-causal-evidence-required');
  controls.initialStateHash = baselineHash;
  controls.interventionSnapshotHash = baselineHash;
  await db.run('UPDATE daemon_finding_evidence SET metadata_json = ? WHERE id = 1',
    JSON.stringify({ causalControls: controls }));
  assert.equal(await gate.transitionError(db, change), 'controlled-causal-evidence-required');
  controls.interventionSnapshotHash = interventionHash;
  await db.run('UPDATE daemon_finding_evidence SET metadata_json = ? WHERE id = 1',
    JSON.stringify({ causalControls: controls }));
  assert.equal(await gate.transitionError(db, change), 'controlled-causal-evidence-required');
  const outputHash = 'd'.repeat(64);
  const pair = { baseline: { exitCode: 1, outputHash, truncated: false },
    intervention: { exitCode: 0, outputHash, truncated: false } };
  const payload = { apiVersion: 'genos.daemon-controlled-run/v1', findingId: 'finding.test',
    workspaceId: 'workspace.test', baselineSnapshotId: 'baseline', interventionSnapshotId: 'intervention',
    initialStateHash: baselineHash, interventionSnapshotHash: interventionHash,
    command: 'npm test', runs: [pair, pair] };
  const payloadJson = JSON.stringify(payload);
  const payloadHash = crypto.createHash('sha256').update(payloadJson).digest('hex');
  await db.run('INSERT INTO provenance_records VALUES (?, ?, ?, ?, ?)',
    'provenance.test', 'daemon_causal_run', 'finding.test', payloadHash, payloadJson);
  assert.equal(await gate.transitionError(db, change), null);
  await db.close();
  console.log('Daemon causal snapshot gate: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
