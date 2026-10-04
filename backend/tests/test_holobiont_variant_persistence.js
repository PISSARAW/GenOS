'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { migrateHolobiontSessions } = require('../src/db/migrations/migrateHolobiontSessions');
const { migrateHolobiontVariantEvents } = require('../src/db/migrations/migrateHolobiontVariantEvents');
const store = require('../src/services/holobionte/holobiontStore');
const controller = require('../src/services/holobionte/variants/variantRuntimeController');

async function testLegacyEventTableUpgradePreservesHistory() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`
      CREATE TABLE holobiont_sessions (holobiont_id TEXT PRIMARY KEY);
      INSERT INTO holobiont_sessions (holobiont_id) VALUES ('legacy-host');
      CREATE TABLE holobiont_events (
        event_id TEXT PRIMARY KEY, holobiont_id TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision > 0),
        event_type TEXT NOT NULL CHECK (event_type IN (
          'HOST_CREATED', 'CONSTITUTION_UPDATED', 'SYMBIONT_DISCOVERED',
          'SYMBIONT_ADMISSION_STARTED', 'SYMBIONT_ADMITTED', 'SYMBIONT_REJECTED',
          'SYMBIONT_QUARANTINED', 'SYMBIONT_SANCTIONED', 'SYMBIONT_EXPELLED',
          'SYMBIONT_DORMANT', 'RESOURCE_GRANTED', 'RESOURCE_REVOKED',
          'CAPABILITY_USED', 'CONTRIBUTION_VERIFIED', 'IMMUNE_REJECTION',
          'IMMUNE_OVERRIDE', 'VERTICAL_TRANSMISSION', 'HORIZONTAL_ACQUISITION'
        )),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)), actor_id TEXT,
        occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (holobiont_id) REFERENCES holobiont_sessions(holobiont_id) ON DELETE CASCADE,
        UNIQUE (holobiont_id, revision)
      );
      CREATE INDEX idx_holobiont_events_type_time ON holobiont_events(event_type, occurred_at);
      CREATE INDEX idx_holobiont_events_session ON holobiont_events(holobiont_id, revision);
      CREATE TRIGGER holobiont_events_no_update BEFORE UPDATE ON holobiont_events
        BEGIN SELECT RAISE(ABORT, 'holobiont_events is append-only'); END;
      CREATE TRIGGER holobiont_events_no_delete BEFORE DELETE ON holobiont_events
        BEGIN SELECT RAISE(ABORT, 'holobiont_events is append-only'); END;
      INSERT INTO holobiont_events (event_id, holobiont_id, revision, event_type, payload_json)
        VALUES ('legacy-event', 'legacy-host', 1, 'HOST_CREATED', '{}');
    `);

    await migrateHolobiontVariantEvents(db);
    const events = await db.all('SELECT event_id, event_type FROM holobiont_events ORDER BY revision');
    assert.deepStrictEqual(events, [{ event_id: 'legacy-event', event_type: 'HOST_CREATED' }]);
    await db.run(`INSERT INTO holobiont_events
      (event_id, holobiont_id, revision, event_type, payload_json)
      VALUES ('variant-event', 'legacy-host', 2, 'VARIANT_SELECTED', '{}')`);
    await assert.rejects(() => db.run("UPDATE holobiont_events SET payload_json = '{}' WHERE event_id = 'legacy-event'"), /append-only/);
    await migrateHolobiontVariantEvents(db);
    assert.deepStrictEqual(await db.get('SELECT COUNT(*) AS count FROM holobiont_events'), { count: 2 });
  } finally {
    await db.close();
  }
}

async function testPersistentVariantSelectionAndEvaluation() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateHolobiontSessions(db);
    await migrateHolobiontVariantEvents(db);
    const session = await store.createSession(db, { hostId: 'runtime-host', missionId: 'variant-mission' });
    const fitContext = { capabilities: ['stable-core', 'diversity', 'cloud-core', 'edge-symbionts',
      'cloud-proxy', 'persistent-memory', 'verified-trials', 'tool-sandbox', 'edge-sync',
      'provenance-verification'], localEngineAvailable: true, immunePlaneAvailable: true, successionAvailable: true };
    const selected = await controller.selectPersistentVariant(db, {
      holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
      variantId: 'organelle', fitContext
    });
    const evaluated = await controller.evaluatePersistentVariant(db, {
      holobiontId: session.holobiontId, expectedSessionRevision: selected.sessionRevision,
      operation: 'assessOrganelle', runtimeInput: {
        dependencyGraph: { nodes: [{ id: 'core', core: true }, { id: 'extension' }], edges: [{ source: 'extension', target: 'core' }] },
        evidenceRefs: ['fixture:core-closure']
      }, verifyEvaluationEvidence: ({ evidenceRefs }) => evidenceRefs.includes('fixture:core-closure')
    });
    assert.equal(evaluated.receipt.variantId, 'organelle');
    assert.deepStrictEqual(evaluated.receipt.result.coreDependencyClosureIds, ['core', 'extension']);
    const stored = await store.getSession(db, session.holobiontId);
    assert.equal(stored.variantState.latestEvaluation.resultHash, evaluated.receipt.resultHash);
    assert.equal((await store.listEvents(db, session.holobiontId)).length, 3);

    const edgeSession = await store.createSession(db, { hostId: 'edge-host', missionId: 'edge-mission' });
    const edgeSelected = await controller.selectPersistentVariant(db, {
      holobiontId: edgeSession.holobiontId, expectedSessionRevision: edgeSession.revision,
      variantId: 'edge-core/cloud-symbionts', fitContext
    });
    const edgeEvaluation = await controller.evaluatePersistentVariant(db, {
      holobiontId: edgeSession.holobiontId, expectedSessionRevision: edgeSelected.sessionRevision,
      operation: 'planPlacementBatch', runtimeInput: { steps: [
        { stepId: 'local-core', availableEngines: ['local'] },
        { stepId: 'remote-capability', availableEngines: ['local', 'cloud'], requiresRemoteCapability: true,
          redacted: true, dataClasses: ['PUBLIC', 'RESTRICTED'], restrictedDataClasses: ['RESTRICTED'],
          verifyCloudConnectivity: () => true }
      ] }, evidenceRefs: ['fixture:edge-runtime'], verifyEvaluationEvidence: ({ evidenceRefs }) => evidenceRefs.length > 0
    });
    assert.equal(edgeEvaluation.receipt.result.steps[1].accepted, true);
    assert.deepStrictEqual(edgeEvaluation.receipt.result.steps[1].dataClasses, ['PUBLIC']);
    assert.equal(edgeEvaluation.receipt.result.steps[1].symbionts, 'cloud-on-demand');
  } finally {
    await db.close();
  }
}

(async () => {
  await testLegacyEventTableUpgradePreservesHistory();
  await testPersistentVariantSelectionAndEvaluation();
  console.log('✅ Holobiont variant persistence tests passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
