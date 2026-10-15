'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { migrateMissionEpisodes } = require('../src/db/migrations/migrateMissionEpisodes');
const episodes = require('../src/services/missionEpisodeService');
const threads = require('../src/services/cellThreadService');

const SCOPE = { organizationId: 'org-a', projectId: 'project-a' };

async function fixture() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE missions (
      mission_id TEXT PRIMARY KEY, objective TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
    INSERT INTO missions VALUES ('mission-a', 'A', 'active');
    INSERT INTO missions VALUES ('mission-b', 'B', 'active');`);
  await migrateMissionEpisodes(db);
  await migrateMissionEpisodes(db);
  return db;
}

async function createEpisode(db, overrides = {}) {
  return episodes.create(db, {
    ...SCOPE, missionId: 'mission-a', episodeId: 'episode-a',
    organismId: 'organism-a', organismRevision: 'revision-1',
    habitatId: 'habitat-a', habitatRevision: 1,
    ...overrides
  });
}

async function createRoot(db, overrides = {}) {
  return threads.create(db, {
    ...SCOPE, missionId: 'mission-a', episodeId: 'episode-a',
    threadId: 'thread-root', workerId: 'orchestrator-a', cellKind: 'orchestrator',
    ...overrides
  });
}

test('migration persists scoped episode and correlated parent-child threads', async () => {
  const db = await fixture();
  try {
    const episode = await createEpisode(db);
    const root = await createRoot(db);
    const child = await threads.create(db, {
      ...SCOPE, missionId: 'mission-a', episodeId: episode.episodeId,
      threadId: 'thread-child', parentThreadId: root.threadId,
      workerId: 'worker-a', cellKind: 'worker'
    });
    assert.equal(episode.habitatRevision, 1);
    assert.equal(child.parentThreadId, root.threadId);
    assert.equal((await episodes.get(db, { ...SCOPE, episodeId: episode.episodeId })).rootThreadId,
      root.threadId);
    assert.deepEqual((await threads.list(db, { ...SCOPE, episodeId: episode.episodeId }))
      .map((item) => item.threadId), ['thread-child', 'thread-root']);
    const foreignKeys = await db.all("PRAGMA foreign_key_list('cell_threads')");
    assert.ok(foreignKeys.some((key) => key.table === 'mission_episodes'));
    assert.ok(foreignKeys.some((key) => key.table === 'cell_threads'));
  } finally { await db.close(); }
});

test('episode and cell lifecycles accept declared transitions and reject regressions', async () => {
  const db = await fixture();
  try {
    await createEpisode(db);
    await createRoot(db);
    assert.equal((await episodes.transition(db, {
      ...SCOPE, missionId: 'mission-a', episodeId: 'episode-a', status: 'active'
    })).revision, 1);
    await assert.rejects(episodes.transition(db, {
      ...SCOPE, episodeId: 'episode-a', status: 'embryonic'
    }), (error) => error.code === 'MISSION_EPISODE_INVALID_TRANSITION');
    await threads.transition(db, { ...SCOPE, missionId: 'mission-a', threadId: 'thread-root', status: 'ready' });
    await threads.transition(db, { ...SCOPE, missionId: 'mission-a', threadId: 'thread-root', status: 'active' });
    const completed = await threads.transition(db, {
      ...SCOPE, missionId: 'mission-a', threadId: 'thread-root',
      status: 'completed_execution', stopReason: 'work_finished', contextSize: 123
    });
    assert.equal(completed.stopReason, 'work_finished');
    assert.equal(completed.contextSize, 123);
    await threads.transition(db, { ...SCOPE, threadId: 'thread-root', status: 'fossilized' });
    await assert.rejects(threads.transition(db, {
      ...SCOPE, threadId: 'thread-root', status: 'active'
    }), (error) => error.code === 'CELL_THREAD_INVALID_TRANSITION');
  } finally { await db.close(); }
});

test('tenant and mission mismatches fail closed before thread creation or mutation', async () => {
  const db = await fixture();
  try {
    await createEpisode(db);
    await createRoot(db);
    await assert.rejects(episodes.transition(db, {
      organizationId: 'org-b', projectId: 'project-b',
      episodeId: 'episode-a', status: 'active'
    }), (error) => error.code === 'MISSION_EPISODE_SCOPE_DENIED' && error.status === 403);
    await assert.rejects(createEpisode(db, {
      organizationId: 'org-b', projectId: 'project-b', episodeId: 'episode-other'
    }), (error) => error.code === 'MISSION_EPISODE_SCOPE_DENIED' && error.status === 403);
    await assert.rejects(threads.create(db, {
      ...SCOPE, missionId: 'mission-b', episodeId: 'episode-a',
      parentThreadId: 'thread-root', workerId: 'worker-b', cellKind: 'worker'
    }), (error) => error.code === 'MISSION_EPISODE_MISSION_MISMATCH');
    await assert.rejects(threads.transition(db, {
      organizationId: 'org-b', projectId: 'project-b',
      threadId: 'thread-root', status: 'ready'
    }), (error) => error.code === 'CELL_THREAD_SCOPE_DENIED' && error.status === 403);
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM cell_threads')).count, 1);
  } finally { await db.close(); }
});

test('parent linkage rejects another episode and deletion is restricted to embryonic leaves', async () => {
  const db = await fixture();
  try {
    await createEpisode(db);
    await createRoot(db);
    await createEpisode(db, { missionId: 'mission-b', episodeId: 'episode-b' });
    await assert.rejects(threads.create(db, {
      ...SCOPE, missionId: 'mission-b', episodeId: 'episode-b',
      parentThreadId: 'thread-root', workerId: 'worker-b', cellKind: 'worker'
    }), (error) => error.code === 'CELL_THREAD_PARENT_MISMATCH');
    await threads.create(db, {
      ...SCOPE, missionId: 'mission-a', episodeId: 'episode-a',
      threadId: 'thread-child', parentThreadId: 'thread-root',
      workerId: 'worker-a', cellKind: 'worker'
    });
    await assert.rejects(threads.remove(db, { ...SCOPE, threadId: 'thread-root' }),
      (error) => error.code === 'CELL_THREAD_DELETE_DENIED');
    await episodes.remove(db, { ...SCOPE, missionId: 'mission-b', episodeId: 'episode-b' });
    assert.equal(await episodes.get(db, { ...SCOPE, episodeId: 'episode-b' }), null);
  } finally { await db.close(); }
});
