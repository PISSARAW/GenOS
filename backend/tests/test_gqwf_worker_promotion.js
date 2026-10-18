'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createFabric, migrateGqwf } = require('../src/services/gqwf');
const workers = require('../src/services/gqwf/workers');

async function fixture() {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-promotion-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'worker-promotion-'));
  const workspacePath = path.join(root, 'workspace');
  await fs.mkdir(workspacePath);
  await fs.writeFile(path.join(workspacePath, 'answer.txt'), 'base');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT NOT NULL,
      organization_id TEXT, project_id TEXT);
    CREATE TABLE agent_capsule_cleanup (agent_id TEXT PRIMARY KEY,
      workspace_root TEXT NOT NULL, epoch TEXT);`);
  await db.run('INSERT INTO workspaces (id, path) VALUES (?, ?)', 'workspace', workspacePath);
  await migrateGqwf(db);
  return { db, parent, root, workspacePath };
}

async function capturedCandidate(context, workerId, content) {
  const opened = await workers.materializeWorker(context.db, {
    workerId, workspaceId: 'workspace', sourcePath: context.workspacePath
  });
  await fs.writeFile(path.join(opened.path, 'answer.txt'), content);
  return workers.finalizeWorker(context.db, { workerId, outcomeStatus: 'completed' });
}

function verified(request) {
  return {
    success: true,
    evidenceId: request.evidenceId,
    workerId: request.workerId,
    viewId: request.viewId,
    workspaceId: request.workspaceId,
    headName: request.name,
    baseHash: request.baseHash,
    previousHash: request.expectedHash,
    generation: request.expectedGeneration,
    candidateHash: request.candidateHash
  };
}

function promotionInput(workerId, baseHash, evidenceId) {
  return { workerId, workspaceId: 'workspace', name: 'main', expectedHash: baseHash,
    expectedGeneration: 0, evidenceId };
}

async function exercisePromotion(context) {
  const first = await capturedCandidate(context, 'worker-1', 'candidate-one');
  const second = await capturedCandidate(context, 'worker-2', 'candidate-two');
  assert.equal(first.baseHash, second.baseHash);
  const blocked = createFabric(context.db);
  await blocked.initializeHead({ workspaceId: 'workspace', name: 'main', rootHash: first.baseHash });
  const candidates = await blocked.inspectWorkerCandidates({
    workspaceId: 'workspace', workerIds: ['worker-2', 'worker-1', 'missing']
  });
  assert.deepEqual(candidates.map((item) => item.workerId), ['worker-1', 'worker-2']);
  const request = promotionInput('worker-1', first.baseHash, 'evidence-worker-1');
  await assert.rejects(blocked.promoteWorkerCandidate(request), /verifier is unavailable/);
  const forged = createFabric(context.db, { verifyWorkerPromotion: async (input) => ({
    ...verified(input), evidenceId: 'different-evidence'
  }) });
  await assert.rejects(forged.promoteWorkerCandidate(request), /evidence bound/);
  await assertAtomicReceipt(context, request);
  const fabric = createFabric(context.db, { verifyWorkerPromotion: async (input) => verified(input) });
  const promoted = await fabric.promoteWorkerCandidate(request);
  assert.equal(promoted.workerId, 'worker-1');
  assert.equal(promoted.generation, 1);
  assert.equal((await fabric.getHead({ workspaceId: 'workspace', name: 'main' })).rootHash,
    first.candidateHash);
  const replay = createFabric(context.db, { verifyWorkerPromotion: async () => {
    throw new Error('verifier must not run for a persisted receipt');
  } });
  assert.deepEqual(await replay.promoteWorkerCandidate(request), promoted);
  const stale = promotionInput('worker-2', second.baseHash, 'evidence-worker-2');
  await assert.rejects(fabric.promoteWorkerCandidate(stale), /head changed/);
  assert.equal((await context.db.get('SELECT COUNT(*) AS count FROM gqwf_worker_promotions')).count, 1);
}

async function assertAtomicReceipt(context, request) {
  await context.db.exec(`CREATE TRIGGER reject_worker_promotion BEFORE INSERT ON gqwf_worker_promotions
    BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END;`);
  const fabric = createFabric(context.db, { verifyWorkerPromotion: async (input) => verified(input) });
  await assert.rejects(fabric.promoteWorkerCandidate(request), /injected receipt failure/);
  const head = await fabric.getHead({ workspaceId: 'workspace', name: 'main' });
  assert.equal(head.rootHash, request.expectedHash);
  assert.equal(head.generation, 0);
  assert.equal((await context.db.get('SELECT COUNT(*) AS count FROM gqwf_head_events')).count, 0);
  await context.db.exec('DROP TRIGGER reject_worker_promotion;');
}

async function main() {
  const context = await fixture();
  try {
    await exercisePromotion(context);
    console.log('GQWF worker evidence-gated promotion: PASS');
  } finally {
    await context.db.close();
    assert.equal(path.dirname(context.root), context.parent);
    await fs.rm(context.root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
