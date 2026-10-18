'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createFabric, migrateGqwf } = require('../src/services/gqwf');
const missionExecution = require('../src/services/gqwf/missionExecution');
const { provisionMissionWorkspace } = require('../src/services/agentWorkspaceLifecycleService');

async function fixture() {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-mission-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'mission-'));
  const workspacePath = path.join(root, 'workspace');
  await fs.mkdir(workspacePath);
  await fs.writeFile(path.join(workspacePath, 'source.txt'), 'source');
  const db = await open({ filename: path.join(root, 'state.sqlite'), driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY, path TEXT NOT NULL,
      organization_id TEXT, project_id TEXT
    );`);
  await db.run('INSERT INTO workspaces (id, path) VALUES (?, ?)', 'ws-mission', workspacePath);
  await migrateGqwf(db);
  return { parent, root, workspacePath, db };
}

function context(fixtureState, runId, overrides = {}) {
  return {
    db: fixtureState.db,
    agentId: `agent-${runId}`,
    executable: 'codex',
    executionRun: { id: runId },
    dispatchedAgent: { execution_mode: 'orchestrator', workspace_id: 'ws-mission',
      ...(overrides.dispatchedAgent || {}) },
    normalizedMission: {
      workspaceId: 'ws-mission',
      workspaceRoot: fixtureState.workspacePath,
      executionPolicy: { gqwfV2: true, allowFileEdits: true },
      ...(overrides.normalizedMission || {})
    }
  };
}

async function verifyDeferredCopy(fixtureState) {
  const mission = context(fixtureState, 'run-deferred').normalizedMission;
  const provisioned = await provisionMissionWorkspace(mission, 'orchestrator');
  assert.equal(provisioned.workspaceRoot, fixtureState.workspacePath);
  assert.equal(provisioned.gqwfSourceWorkspaceRoot, fixtureState.workspacePath);
  await assert.rejects(fs.stat(path.join(fixtureState.root, '.genos-agent-worlds')), { code: 'ENOENT' });
}

async function verifySuccessfulRun(fixtureState) {
  const ctx = context(fixtureState, 'run-success');
  const prepared = await missionExecution.prepareMissionWorkspace(ctx);
  assert.equal(prepared.state, 'materialized');
  assert.notEqual(prepared.path, fixtureState.workspacePath);
  assert.equal(ctx.normalizedMission.workspaceRoot, prepared.path);
  assert.equal(await fs.readFile(path.join(prepared.path, 'source.txt'), 'utf8'), 'source');
  await fs.writeFile(path.join(prepared.path, 'result.txt'), 'candidate');
  const finalized = await missionExecution.finalizeMissionWorkspace({
    db: fixtureState.db, executionRunId: 'run-success', outcomeStatus: 'completed'
  });
  assert.equal(finalized.state, 'released');
  assert.equal(finalized.outcome, 'completed');
  assert.ok(finalized.candidateHash);
  await assert.rejects(fs.stat(prepared.path), { code: 'ENOENT' });
  const candidate = await createFabric(fixtureState.db).createView({
    workspaceId: 'ws-mission', baseHash: finalized.candidateHash
  });
  assert.equal((await createFabric(fixtureState.db).readFile({
    workspaceId: 'ws-mission', viewId: candidate.id, path: 'result.txt'
  })).toString(), 'candidate');
  await assert.rejects(fs.stat(path.join(fixtureState.workspacePath, 'result.txt')), { code: 'ENOENT' });
}

async function verifyFailedRun(fixtureState) {
  const ctx = context(fixtureState, 'run-failed');
  const prepared = await missionExecution.prepareMissionWorkspace(ctx);
  await fs.writeFile(path.join(prepared.path, 'discarded.txt'), 'discard me');
  const finalized = await missionExecution.finalizeMissionWorkspace({
    db: fixtureState.db, executionRunId: 'run-failed', outcomeStatus: 'failed'
  });
  assert.equal(finalized.state, 'released');
  assert.equal(finalized.outcome, 'discarded');
  assert.equal(finalized.candidateHash, null);
  await assert.rejects(fs.stat(prepared.path), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(fixtureState.workspacePath, 'discarded.txt')), { code: 'ENOENT' });
}

async function verifyPreviouslyExcludedRuntime(fixtureState, runId, overrides) {
  const ctx = context(fixtureState, runId, overrides);
  assert.equal(missionExecution.eligible(ctx), true);
  const prepared = await missionExecution.prepareMissionWorkspace(ctx);
  assert.equal(prepared.backend, 'gqwf');
  assert.notEqual(prepared.path, fixtureState.workspacePath);
  const finalized = await missionExecution.finalizeMissionWorkspace({
    db: fixtureState.db, executionRunId: runId, outcomeStatus: 'failed'
  });
  assert.equal(finalized.outcome, 'discarded');
}

async function main() {
  const fixtureState = await fixture();
  try {
    await verifyDeferredCopy(fixtureState);
    await verifySuccessfulRun(fixtureState);
    await verifyFailedRun(fixtureState);
    await verifyPreviouslyExcludedRuntime(fixtureState, 'run-deterministic', {
      dispatchedAgent: { execution_mode: 'worker' },
      normalizedMission: { workerKind: 'procedural_executor' }
    });
    await verifyPreviouslyExcludedRuntime(fixtureState, 'run-in-process', {
      normalizedMission: { localModel: 'fixture-model', localRuntime: true }
    });
    console.log('GQWF supervised mission execution checks passed.');
  } finally {
    await fixtureState.db.close();
    if (path.dirname(fixtureState.root) !== fixtureState.parent
      || !path.basename(fixtureState.root).startsWith('mission-')) {
      throw new Error('Refusing to remove an unmanaged GQWF mission fixture.');
    }
    await fs.rm(fixtureState.root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
