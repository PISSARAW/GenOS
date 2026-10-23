'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { digest } = require('../src/services/evidenceContractService');
const { createReplaySnapshot } = require('../src/services/workerEvidenceReplaySnapshot');

async function main() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-worker-replay-'));
  try {
    const sourceSnapshot = path.join(workspaceRoot, 'source.json');
    const report = { outcome: 'success', claims: [{ statement: 'verified', evidence: ['mission'] }] };
    fs.writeFileSync(sourceSnapshot, JSON.stringify({ snapshot_id: 'base-1', agent_id: 'worker-1',
      branch_id: 'branch-1', world_id: 'world-main', genome: { kind: 'AgentGenome', apiVersion: 'v0alpha1' },
      state: { working_memory: [], entropy: 0, dissonance: 0 } }));
    const input = { workerId: 'worker-1', runId: 'run-1', workspaceRoot, sourceSnapshot,
      evidenceReport: report };
    const first = await createReplaySnapshot(input);
    const snapshot = JSON.parse(fs.readFileSync(first.snapshotPath, 'utf8'));
    const [step] = snapshot.state.working_memory;
    assert.ok(first.snapshotPath.startsWith(workspaceRoot));
    assert.equal(snapshot.world_id, 'world-main');
    assert.equal(step.action, 'worker_evidence_report');
    assert.equal(step.payload.executionRunId, 'run-1');
    assert.equal(step.payload.evidenceReportHash, digest(report));
    assert.equal(step.step_hash.length, 64);
    const retry = await createReplaySnapshot(input);
    assert.equal(retry.snapshotPath, first.snapshotPath);
    await assert.rejects(createReplaySnapshot({ ...input, runId: '../escape' }),
      { code: 'WORKER_REPLAY_RUN_INVALID' });
    assert.equal(fs.existsSync(path.join(workspaceRoot, 'escape.json')), false);
    console.log('Worker evidence replay snapshot checks passed.');
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
