'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const runtime = require('../src/services/missionEpisodeRuntime');
const { migrateMissionEpisodes } = require('../src/db/migrations/migrateMissionEpisodes');

async function fixture(options = {}) {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE missions (mission_id TEXT PRIMARY KEY, objective TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active');
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT);
    CREATE TABLE strategy_contracts (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL,
      version INTEGER NOT NULL, contract_hash TEXT NOT NULL);
    INSERT INTO missions VALUES ('mission-a', 'A', 'active');
    INSERT INTO workspaces VALUES ('workspace-a', 'org-a', 'project-a');
    INSERT INTO agents VALUES ('orchestrator-a', ${options.unscoped ? 'NULL' : "'workspace-a'"});
    INSERT INTO strategy_contracts VALUES ('strategy-orchestrator-a-1',
      'orchestrator-a', 1, 'sha256:contract');`);
  await migrateMissionEpisodes(db);
  return db;
}

function input(request = {}) {
  return {
    missionId: 'mission-a', orchestratorId: 'orchestrator-a',
    action: 'orchestrate', request
  };
}

test('mission bootstrap creates and propagates one active episode and root thread', async () => {
  const db = await fixture();
  try {
    const first = await runtime.ensure(db, input());
    const second = await runtime.ensure(db, input());
    const request = runtime.propagate({}, first);
    assert.equal(first.available, true);
    assert.equal(first.episode.status, 'active');
    assert.equal(first.rootThread.status, 'active');
    assert.equal(first.episode.organismRevision, 'strategy-orchestrator-a-1');
    assert.equal(second.episodeId, first.episodeId);
    assert.equal(second.rootThreadId, first.rootThreadId);
    assert.deepEqual(request.missionScope, {
      available: true, episodeId: first.episodeId, rootThreadId: first.rootThreadId
    });
    assert.deepEqual(request.developmentalContext.missionEpisode, request.missionScope);
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM mission_episodes')).count, 1);
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM cell_threads')).count, 1);
  } finally { await db.close(); }
});

test('persisted workspace scope rejects conflicting request scope', async () => {
  const db = await fixture();
  try {
    await assert.rejects(runtime.ensure(db, input({
      organizationId: 'org-other', projectId: 'project-other'
    })), (error) => error.code === 'MISSION_EPISODE_SCOPE_MISMATCH');
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM mission_episodes')).count, 0);
  } finally { await db.close(); }
});

test('legacy unscoped mission remains executable and reports missing correlation', async () => {
  const db = await fixture({ unscoped: true });
  try {
    const result = await runtime.ensure(db, input());
    const request = runtime.propagate({}, result);
    assert.deepEqual(result, {
      available: false, reason: 'MISSION_EPISODE_SCOPE_UNAVAILABLE'
    });
    assert.deepEqual(request.missionScope, result);
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM mission_episodes')).count, 0);
  } finally { await db.close(); }
});

test('an explicit episode from another mission is rejected', async () => {
  const db = await fixture();
  try {
    await db.run("INSERT INTO missions VALUES ('mission-b', 'B', 'active')");
    const existing = await runtime.ensure(db, {
      ...input(), missionId: 'mission-b', request: { episodeId: 'shared-episode' }
    });
    assert.equal(existing.available, true);
    await assert.rejects(runtime.ensure(db, input({ episodeId: 'shared-episode' })),
      (error) => error.code === 'MISSION_EPISODE_MISSION_MISMATCH');
  } finally { await db.close(); }
});
