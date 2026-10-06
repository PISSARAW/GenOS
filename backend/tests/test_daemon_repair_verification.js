'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fixture, closeFixture } = require('./helpers/daemonCompletionFixture');
const snapshots = require('../src/services/workspaceSnapshotStore');
const findings = require('../src/services/daemon/findings/findingService');
const evidence = require('../src/services/daemon/findings/findingEvidenceService');
const controlled = require('../src/services/daemon/verification/controlledFindingRunnerService');
const repair = require('../src/services/daemon/repair/repairEpisodeService');
const verification = require('../src/services/daemon/repair/repairVerificationService');

async function schema(value) {
  await value.db.exec(`CREATE TABLE workspaces(id TEXT PRIMARY KEY, path TEXT);
    CREATE TABLE workspace_snapshots(id TEXT PRIMARY KEY, workspace_id TEXT, snapshot_hash TEXT,
      step_number INTEGER, label TEXT, author TEXT, reason TEXT, diff_summary TEXT,
      metadata TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  await value.db.run('INSERT INTO workspaces VALUES (?, ?)', 'workspace-test', value.root);
}

async function admit(value, capsule) {
  const workspace = { id: 'workspace-test', path: value.root };
  fs.writeFileSync(path.join(capsule, 'package.json'), JSON.stringify({ scripts: { test: 'node check.js' } }));
  fs.writeFileSync(path.join(capsule, 'check.js'), 'process.exit(1)');
  const baseline = await snapshots.capture({ db: value.db, workspace, sourcePath: capsule });
  fs.writeFileSync(path.join(capsule, 'check.js'), 'process.exit(0)');
  const intervention = await snapshots.capture({ db: value.db, workspace, sourcePath: capsule });
  await findings.createFinding(value.db, { id: 'finding.real-repair', territoryId: value.context.territoryId,
    headSha: 'a'.repeat(40), claim: 'The test fails before the fix and passes after it',
    scope: { type: 'file', value: 'check.js' }, createdBy: value.context.daemonId, status: 'HYPOTHESIZED', limitations: ['controlled local fixture'] });
  const runs = await Promise.all([snapshots.runInSnapshot({ snapshot: await snapshots.getSnapshot(value.db, workspace.id, baseline.id), command: 'npm test' }),
    snapshots.runInSnapshot({ snapshot: await snapshots.getSnapshot(value.db, workspace.id, baseline.id), command: 'npm test' })]);
  assert.ok(runs.every((run) => run.exitCode !== 0 && !run.truncated));
  const provenanceRecordId = await require('../src/services/daemon/verification/observationReceiptService').record(value.db, {
    findingId: 'finding.real-repair', baselineSnapshotId: baseline.id, runs: runs.map((run) => ({ exitCode: run.exitCode, truncated: run.truncated })) });
  await evidence.appendEvidence(value.db, { findingId: 'finding.real-repair', side: 'supporting',
    evidenceType: 'replicated', description: 'Independent baseline test runs',
    provenanceRecordId, metadata: { occurrences: runs.length } });
  for (const status of ['SUPPORTED', 'REPRODUCED']) {
    const moved = await findings.transitionFinding(value.db, { id: 'finding.real-repair', toStatus: status });
    assert.equal(moved.finding.status, status);
  }
  const causal = await controlled.runControlledFinding(value.db, { findingId: 'finding.real-repair',
    baselineSnapshotId: baseline.id, interventionSnapshotId: intervention.id, command: 'npm test' });
  assert.equal(causal.supported, true);
  for (const status of ['CAUSALLY_SUPPORTED', 'REPAIRABLE']) {
    const moved = await findings.transitionFinding(value.db, { id: 'finding.real-repair', toStatus: status });
    assert.equal(moved.finding.status, status);
  }
  return intervention.id;
}

async function main() {
  const value = await fixture();
  const capsule = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-daemon-repair-capsule-'));
  try {
    await schema(value);
    const snapshotId = await admit(value, capsule);
    const opened = await repair.openEpisode(value.db, { findingId: 'finding.real-repair', createdBy: value.context.daemonId });
    assert.equal(opened.opened, true);
    assert.equal(opened.deduped, true, 'causal transition auto-opens the episode');
    const id = opened.episode.id;
    let workerId = 'worker.real-repair';
    const claims = await Promise.all([repair.claimEpisode(value.db, { id, workerId, workspacePath: capsule }),
      repair.claimEpisode(value.db, { id, workerId: 'worker.other', workspacePath: capsule })]);
    assert.equal(claims.filter((row) => row.claimed).length, 1);
    workerId = claims.find((row) => row.claimed).episode.workerId;
    const fabricated = await repair.closeEpisode(value.db, { id, workerId, toStatus: 'SUCCEEDED', verification: { verified: true } });
    assert.deepEqual(fabricated.errors, ['post-repair-verification-required']);
    await assert.rejects(verification.verifyRepair(value.db, { id, workerId: 'wrong-worker', snapshotId, command: 'npm test' }), /claimed-worker-required/);
    fs.writeFileSync(path.join(capsule, 'outside-scope.txt'), 'unbound change');
    try { await assert.rejects(verification.verifyRepair(value.db, { id, workerId, snapshotId, command: 'npm test' })); }
    finally { fs.unlinkSync(path.join(capsule, 'outside-scope.txt')); }
    const verified = await verification.verifyRepair(value.db, { id, workerId, snapshotId, command: 'npm test' });
    assert.equal(verified.verified, true, JSON.stringify(verified));
    assert.equal(verified.runs.length, 2);
    const wrongWorker = await repair.closeEpisode(value.db, { id, workerId: 'worker.unauthorized', toStatus: 'SUCCEEDED', verification: verified });
    assert.equal(wrongWorker.closed, false);
    const closed = await repair.closeEpisode(value.db, { id, workerId, toStatus: 'SUCCEEDED', verification: verified });
    assert.equal(closed.closed, true);
    assert.equal(closed.episode.status, 'SUCCEEDED');
    assert.equal((await findings.getFinding(value.db, { id: 'finding.real-repair' })).finding.status, 'REPAIRABLE');
    console.log('Real causal repair and twice-executed verification passed.');
  } finally {
    await closeFixture(value);
    const target = path.resolve(capsule);
    if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith('genos-daemon-repair-capsule-')) throw new Error('Unsafe capsule cleanup');
    fs.rmSync(target, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
