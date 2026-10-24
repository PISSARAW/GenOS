'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'social-development-loop-store-test-only';
const assert = require('node:assert/strict');
const { getDatabase, closeDatabase } = require('../src/db');
const store = require('../src/services/socialDevelopmentLoopStore');

async function testClaimLifecycle(db) {
  const input = { scope: { organizationId: 'loop-org', projectId: 'loop-project' },
    agentId: 'loop-agent-a', observationId: 'world-event-1' };
  const first = await store.claim(db, input);
  assert.equal(first.status, 'claimed');
  const concurrent = await store.claim(db, input);
  assert.equal(concurrent.status, 'social-observation-in-progress');
  const result = { action: 'contact', recipientAgentId: 'loop-agent-b' };
  await store.complete(db, { ...input, claimToken: first.claimToken, result });
  const replay = await store.claim(db, input);
  assert.equal(replay.status, 'observation-already-processed');
  assert.deepEqual(replay.result, result);
}

async function testExpiredClaimCanResume(db) {
  const input = { scope: { organizationId: 'loop-org', projectId: 'loop-project' },
    agentId: 'loop-agent-a', observationId: 'world-event-2' };
  const first = await store.claim(db, input);
  await store.fail(db, { ...input, claimToken: first.claimToken });
  const resumed = await store.claim(db, input);
  assert.equal(resumed.status, 'claimed');
  assert.notEqual(resumed.claimToken, first.claimToken);
}

async function main() {
  const db = await getDatabase(':memory:');
  try {
    await testClaimLifecycle(db);
    await testExpiredClaimCanResume(db);
    console.log('Social development durable idempotency and lease recovery: PASS');
  } finally {
    await closeDatabase();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
