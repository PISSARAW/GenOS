'use strict';

const assert = require('assert');
process.env.GENOS_PROMOTION_SECRET = 'holobiont-biocenose-test-secret';
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateBiocenoseSessions } = require('../src/db/migrations/migrateBiocenoseSessions');
const store = require('../src/services/holobionte/holobiontStore');
const constitution = require('../src/services/holobionte/host/hostConstitutionService');
const adapter = require('../src/services/holobionte/host/biocenoseAdapter');

async function setup(db) {
  await migrateHolobiontSessions(db);
  await migrateBiocenoseSessions(db);
  const session = await store.createSession(db, { hostId: 'plural-host', missionId: 'plural-mission' });
  const hostConstitution = constitution.createHostConstitution({ hostId: session.hostId, identity: 'plural-decision' });
  await constitution.updateConstitution(db, {
    holobiontId: session.holobiontId, constitution: hostConstitution, expectedRevision: session.revision
  });
  const now = new Date().toISOString();
  await db.run(`INSERT INTO biocenose_communities (community_id, question, phase, round, status, created_at, updated_at)
    VALUES (?, ?, 'DECIDED', 2, 'DECIDED', ?, ?)`, 'community-ready', 'Review the proposed capability.', now, now);
  await db.run(`INSERT INTO biocenose_judgments (judgment_id, community_id, round, judgment_json, created_at)
    VALUES (?, ?, ?, ?, ?)`, 'judgment-ready', 'community-ready', 2,
  JSON.stringify({ status: 'DECIDED', aggregation: {
    outcome: 'AGREEMENT', position: 'approve-with-limits', evidenceRefs: ['claim:verified-1', 'dissent:reviewed-2']
  } }), now);
  return store.getSession(db, session.holobiontId);
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const session = await setup(db);
    const result = await adapter.authorizeWithJudgment(db, {
      holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
      communityId: 'community-ready', judgmentId: 'judgment-ready', verifierId: 'host-verifier',
      riskScore: 0.1, claim: 'Host decision informed by plural judgment'
    });
    assert.strictEqual(result.authorized, true);
    assert.strictEqual(result.finalAuthority, 'HOST');
    assert.strictEqual(result.advisory.outcome, 'AGREEMENT');
    assert.deepStrictEqual(result.advisory.evidenceRefs, ['claim:verified-1', 'dissent:reviewed-2']);
    await assert.rejects(() => adapter.authorizeWithJudgment(db, {
      holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
      communityId: 'community-other', judgmentId: 'judgment-ready'
    }), { code: 'HOLOBIONT_BIOCENOSE_JUDGMENT_INVALID' });
  } finally {
    await db.close();
  }
  console.log('✅ Holobiont Biocenose integration tests passed.');
}

run().catch((error) => {
  console.error('❌ Holobiont Biocenose integration tests failed:', error);
  process.exitCode = 1;
});
