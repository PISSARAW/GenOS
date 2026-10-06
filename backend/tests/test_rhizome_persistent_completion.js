'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const rhizome = require('../src/services/rhizomeCoordinationService');
const runtime = require('../src/services/rhizome/runtime/rhizomeRuntime');
const store = require('../src/services/topologySessionStore');
const source = require('../src/services/rhizome/telemetry/graphSourceService');
const operations = require('../src/services/topologySessionTools');
const fx = require('./helpers/rhizomeExecutionFixtures');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'rhizome-persistence-test-secret';
process.env.GENOS_RHIZOME_TRUSTED_VERIFIER_DIGESTS = fx.DIGEST;

async function run() {
  const directory = path.resolve('.genos-agent-worlds/rhizome-verification');
  await fs.mkdir(directory, { recursive: true });
  const filename = path.join(directory, crypto.randomUUID() + '.db');
  let db = await open({ filename, driver: sqlite3.Database });
  try {
    const need = { needId: 'persisted-need', capability: 'answer' };
    const session = await rhizome.composeRhizome('Persist verified work.', { db, variant: 'persistent',
      nodes: [fx.node('tool', ['answer'])], budgets: { growth: 1 } });
    const result = await runtime.run({ sessionId: session.sessionId, options: { db }, needs: [need],
      trustedVerifierDigests: [fx.DIGEST], execute: async () => ({ answer: 42 }), verify: fx.makeReceipt });
    assert.equal(result.status, 'VERIFIED');
    const record = await store.load(db, session.sessionId);
    assert.equal(record.state.routeResults.length, 1);
    await db.close();
    db = await open({ filename, driver: sqlite3.Database });
    const live = await source.read({ sessionId: session.sessionId, database: filename });
    assert.equal(live.source, 'backend');
    assert.equal(live.nodes[0].nodeId, 'tool');
    assert.equal(live.routeResultCount, 1);
    const restored = await rhizome.missionMetrics(session.sessionId, { db, needs: [need], trustedVerifierDigests: [fx.DIGEST] });
    assert.equal(restored.canMerge, true);
    const replay = await rhizome.recordRouteOutcome(session.sessionId, record.state.routeResults[0].receipt, { db, trustedVerifierDigests: [fx.DIGEST] });
    assert.equal(replay.duplicate, true);
    assert.equal((await store.load(db, session.sessionId)).state.routeResults.length, 1);
    const viaMcp = await operations.applyTopologyOperation(db, { session_id: session.sessionId, operation: 'mission_metrics', needs: [need] });
    assert.equal(viaMcp.canMerge, true);
    await rhizome.closeSession(session.sessionId, { db });
    await assert.rejects(() => source.read({ sessionId: session.sessionId, database: filename }), { code: 'RHIZOME_SESSION_UNKNOWN' });
  } finally {
    await db.close();
    await fs.rm(filename, { force: true });
  }
}

run().then(() => console.log('Rhizome persistent evidence, restart, replay and live read-only telemetry: PASS'))
  .catch(error => { console.error(error); process.exitCode = 1; });
