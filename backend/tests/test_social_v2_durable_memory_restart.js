'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'social-v2-memory-restart-test-only';
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');
const episodeStore = require('../src/services/autobiographicalMemory/episodeStore');
const recallService = require('../src/services/autobiographicalMemory/recallService');

const EPISODE_ID = 'social-v2-restart-episode';
const AGENT_ID = 'social-v2-agent-a';
const GOAL = 'help agent-b with navigation';

async function verifyPersistedRecall(dbPath, requireEpisode) {
  const db = await getDatabase(dbPath);
  try {
    const episode = await episodeStore.getEpisodeById(EPISODE_ID, db);
    if (!requireEpisode) {
      assert.equal(episode, null);
      return;
    }
    assert.equal(episode.agentId, AGENT_ID);
    assert.equal(episode.action.selectedAction, 'introduced agent-c to agent-b');
    assert.equal(episode.outcome.status, 'verified_help');
    assert.deepEqual(episode.outcome.evidenceRefs, ['receipt:help-17']);
    assert.equal(episode.provenance.kind, 'reported');
    const recall = await recallService.recallForSituation({ agentId: AGENT_ID,
      organizationId: 'social-v2-org', projectId: 'social-v2-project',
      missionId: 'new-mission', kind: 'social_help', goal: GOAL }, {}, db);
    assert.equal(recall.episodes[0].id, EPISODE_ID);
    assert.match(recall.summary, /introduced agent-c to agent-b/);
  } finally {
    await closeDatabase();
  }
}

async function writeEpisode(dbPath) {
  const db = await getDatabase(dbPath);
  try {
    await episodeStore.recordEpisode({ id: EPISODE_ID, agentId: AGENT_ID, missionId: 'first-mission',
      organizationId: 'social-v2-org', projectId: 'social-v2-project', kind: 'social_help', salience: 0.9,
      situation: { goal: GOAL }, decision: { selectedStrategy: 'ask-before-introduction' },
      action: { selectedAction: 'introduced agent-c to agent-b' },
      outcome: { status: 'verified_help', evidenceRefs: ['receipt:help-17'] },
      lesson: { summary: 'Use a verified expert introduction for navigation requests.' } }, db);
  } finally {
    await closeDatabase();
  }
}

function childProbe(dbPath, requireEpisode) {
  execFileSync(process.execPath, [__filename, '--child', dbPath, String(requireEpisode)],
    { stdio: 'inherit', env: process.env });
}

async function parentProbe() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-social-v2-memory-'));
  const durableDb = path.join(tempDir, 'durable.sqlite');
  const freshDb = path.join(tempDir, 'fresh.sqlite');
  try {
    await writeEpisode(durableDb);
    childProbe(durableDb, true);
    childProbe(freshDb, false);
    console.log('SocialWorld V2 episode and source evidence survived a process restart; a fresh database recalled nothing.');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv[2] === '--child') {
    await verifyPersistedRecall(process.argv[3], process.argv[4] === 'true');
    return;
  }
  await parentProbe();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
