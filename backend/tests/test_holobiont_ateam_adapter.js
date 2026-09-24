'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const topologySessions = require('../src/services/topologySessionStore');
const teamRuns = require('../src/services/aTeam/teamRunStore');
const store = require('../src/services/holobionte/holobiontStore');
const adapter = require('../src/services/holobionte/symbionts/aTeamAdapter');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    await topologySessions.ensureTable(db);
    const host = await store.createSession(db, {
      hostId: 'ateam-host', scope: 'PERSISTENT', constitution: { hostId: 'ateam-host' }
    });
    await teamRuns.create(db, {
      teamRunId: 'team-run-1', missionId: 'mission-a', goal: 'Review a migration',
      requiredCapabilities: [{ name: 'migration-review', weight: 1 }], status: 'COMPLETED', phase: 'DEBRIEF',
      members: [{ memberId: 'reviewer-1', role: 'reviewer', expertise: ['migration-review'],
        capabilities: ['migration-review'], status: 'COMPLETED' }]
    });
    const result = await adapter.registerAteamCandidate(db, {
      holobiontId: host.holobiontId, expectedSessionRevision: host.revision,
      teamRunId: 'team-run-1', evidenceRefs: ['handoff:verified', 'ci:passed']
    });
    assert.strictEqual(result.candidate.kind, 'SUB_TOPOLOGY');
    assert.strictEqual(result.candidate.topology, 'a_team');
    assert.deepStrictEqual(result.candidate.capabilities, ['migration-review']);
    const restored = await store.getSession(db, host.holobiontId);
    assert.strictEqual(restored.candidateSymbionts[0].authorityBoundary, 'HOST_RETAINS_FINAL_AUTHORITY');
    assert.strictEqual(restored.candidateSymbionts[0].status, 'CANDIDATE');
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont A-Team integration tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont A-Team integration tests failed:', error);
  process.exitCode = 1;
});
