'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const workerKinds = require('../src/services/agents/workerKindService');
const { ownsReplaySnapshot, enforcePersistedWorkerTool } = require('../src/services/agents/workerContractEnforcement');

async function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-own-replay-'));
  const root = path.join(temporary, 'worker');
  const snapshotDir = path.join(root, '.genos', 'evidence-snapshots');
  fs.mkdirSync(snapshotDir, { recursive: true });
  const snapshot = { snapshot_id: 'snap-worker-owned', agent_id: 'worker-a' };
  const snapshotPath = path.join(snapshotDir, 'run-a.json');
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot));
  const workerContract = workerKinds.buildWorkerContract('scout_cell');
  const db = { get: async (_sql, agentId) => ({ execution_mode: agentId === 'worker-a' ? 'worker' : 'orchestrator',
    path: root, role: 'scout_cell', parent_agent_id: null,
    metadata_json: JSON.stringify({ workerKind: 'scout_cell', workerContract }) }) };
  try {
    assert.equal(await ownsReplaySnapshot({ db: db, agentId: 'worker-a', reference: snapshot.snapshot_id }), true);
    assert.equal(await ownsReplaySnapshot({ db: db, agentId: 'worker-a', reference: snapshotPath }), true);
    assert.equal(await enforcePersistedWorkerTool(db, 'worker-a', {
      toolName: 'genos_replay', args: { snapshot: snapshot.snapshot_id }
    }), true, 'a scout may replay a capsule that ownership checks bind to its worker workspace');
    assert.equal(await ownsReplaySnapshot({ db: db, agentId: 'worker-a', reference: 'snap-other-worker' }), false);
    assert.equal(await ownsReplaySnapshot({ db: db, agentId: 'worker-b', reference: snapshot.snapshot_id }), false);
    assert.equal(await ownsReplaySnapshot({ db: db, agentId: 'worker-a', reference: path.join(temporary, 'outside.json') }), false);
    await assert.rejects(() => enforcePersistedWorkerTool(db, 'worker-a', {
      toolName: 'genos_replay', args: { snapshot: 'snap-other-worker' }
    }), { code: 'WORKER_REPLAY_SNAPSHOT_SCOPE_DENIED' });
    console.log('Worker replay is limited to the caller\'s own evidence snapshot: PASS');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
