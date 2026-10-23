'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ownsReplaySnapshot, enforcePersistedWorkerTool } = require('../src/services/agents/workerContractEnforcement');

async function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-own-replay-'));
  const root = path.join(temporary, 'worker');
  const snapshotDir = path.join(root, '.genos', 'evidence-snapshots');
  fs.mkdirSync(snapshotDir, { recursive: true });
  const snapshot = { snapshot_id: 'snap-worker-owned', agent_id: 'worker-a' };
  const snapshotPath = path.join(snapshotDir, 'run-a.json');
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot));
  const db = { get: async (_sql, agentId) => ({ execution_mode: agentId === 'worker-a' ? 'worker' : 'orchestrator', path: root }) };
  try {
    assert.equal(await ownsReplaySnapshot(db, 'worker-a', snapshot.snapshot_id), true);
    assert.equal(await ownsReplaySnapshot(db, 'worker-a', snapshotPath), true);
    assert.equal(await ownsReplaySnapshot(db, 'worker-a', 'snap-other-worker'), false);
    assert.equal(await ownsReplaySnapshot(db, 'worker-b', snapshot.snapshot_id), false);
    assert.equal(await ownsReplaySnapshot(db, 'worker-a', path.join(temporary, 'outside.json')), false);
    await assert.rejects(() => enforcePersistedWorkerTool(db, 'worker-a', {
      toolName: 'genos_replay', args: { snapshot: 'snap-other-worker' }
    }), { code: 'WORKER_REPLAY_SNAPSHOT_SCOPE_DENIED' });
    console.log('Worker replay is limited to the caller\'s own evidence snapshot: PASS');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
