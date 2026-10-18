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

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'rhizome-growth-routing-e2e-secret';
process.env.GENOS_RHIZOME_TRUSTED_VERIFIER_DIGESTS = fx.DIGEST;

async function run() {
  const directory = path.resolve('.genos-agent-worlds/rhizome-verification');
  await fs.mkdir(directory, { recursive: true });
  const filename = path.join(directory, crypto.randomUUID() + '.db');
  let db = await open({ filename, driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
      CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT, execution_mode TEXT, metadata_json TEXT);
      INSERT INTO workspaces VALUES ('rhizome-workspace', 'org', 'project');`);

    let started = 0, executed = 0, stopped = 0;
    const session = await rhizome.composeRhizome('Grow and route a verified capability.', {
      db, variant: 'routing', budgets: { growth: 1 } });

    await db.run('INSERT INTO agents VALUES (?, ?, ?, ?)', 'rhizome-worker', 'rhizome-workspace', 'worker',
      JSON.stringify({ topologySessionId: session.sessionId }));

    const worker = runtime.create({
      trustedProviderIds: ['local-service'], trustedVerifierDigests: [fx.DIGEST],
      registrations: [{ providerId: 'local-service', kind: 'service', capabilities: ['answer'],
        start: async () => { started += 1; return { instanceId: 'running-service' }; },
        stop: async () => { stopped += 1; },
        probe: async () => ({ status: 'AVAILABLE', reliability: 0.95, evidenceRefs: ['live-probe:1'] }),
        execute: async () => { executed += 1; return { answer: 42 }; } }],
      verifiers: [{ verifierId: 'independent-review', verifierDigest: fx.DIGEST, capabilities: ['answer'],
        verifyCapability: fx.makeProof, verifyRoute: fx.makeReceipt }] });

    const result = await worker.run({
      sessionId: session.sessionId, options: { db },
      needs: [{ needId: 'grown', capability: 'answer' }],
      candidates: context => [fx.candidate(context)], dynamicVariants: false });

    assert.equal(result.results[0].status, 'GROWTH_ADMITTED_ROUTE_READY', JSON.stringify(result.results[0].execution));
    assert.equal(result.results[1].status, 'ROUTE_SUCCESS');
    assert.equal(result.status, 'VERIFIED');
    assert.equal(started, 1);
    assert.equal(executed, 1);
    const recordAfterRun = await store.load(db, session.sessionId);
    assert.ok(Math.abs(recordAfterRun.state.budgets.growth - 0.8) < 1e-9);
    assert.equal((recordAfterRun.state.openGaps || []).length, 0);

    const record = await store.load(db, session.sessionId);
    assert.equal(record.state.routeResults.length, 1);

    const live = await source.read({ sessionId: session.sessionId, database: filename });
    assert.equal(live.source, 'backend');
    assert.ok(live.routeResultCount >= 1);

    const restored = await rhizome.missionMetrics(session.sessionId, { db, needs: [{ needId: 'grown', capability: 'answer' }], trustedVerifierDigests: [fx.DIGEST] });
    assert.equal(restored.canMerge, true);

    const replay = await rhizome.recordRouteOutcome(session.sessionId, record.state.routeResults[0].receipt, { db, trustedVerifierDigests: [fx.DIGEST] });
    assert.equal(replay.duplicate, true);
    assert.equal((await store.load(db, session.sessionId)).state.routeResults.length, 1);

    const viaMcp = await operations.applyTopologyOperation(db,
      { session_id: session.sessionId, operation: 'mission_metrics', needs: [{ needId: 'grown', capability: 'answer' }] }, { agentId: 'rhizome-worker' });
    assert.equal(viaMcp.canMerge, true);

    const closed = await worker.close({ sessionId: session.sessionId, options: { db } });
    assert.equal(closed.closed, true);
    assert.equal(stopped, 1);

    await assert.rejects(() => source.read({ sessionId: session.sessionId, database: filename }), { code: 'RHIZOME_SESSION_UNKNOWN' });
  } finally {
    await db.close();
    await fs.rm(filename, { force: true });
  }
}

run().then(() => console.log('Rhizome growth and routing E2E: PASS'))
  .catch(error => { console.error(error); process.exitCode = 1; });