'use strict';
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const manifest = require('../src/services/trinityRunManifest');
const trace = require('../src/services/trinityTraceEvents');
const values = require('../src/services/trinityProvenanceValues');
const stamp = '2026-10-06T12:00:00.000Z';

function input() {
  return { correlation: { missionId: 'mission', experimentId: 'experiment', runId: 'run', worldId: 'w1',
    workerId: 'worker', parentId: 'parent', tenantId: 'tenant', workspaceRoot: 'D:/private/world',
    snapshotHash: values.hashBytes('snapshot') }, revision: { commit: 'a'.repeat(40), dirtyHash: values.hashBytes('dirty') },
  originalMission: 'Ne pas ajouter une recherche.', contract: { requirements: ['constraint'] },
  publicPrompt: 'Mission exacte', fixture: { input: [1, 2] }, verifier: 'assert(actual === expected)',
  requestedRuntime: { model: 'requested', budget: 8000 }, timestamp: stamp,
  workers: [{ workerId: 'worker', worldNumber: 1, role: 'scientifique', workerKind: 'procedure' }],
  toolLeases: [{ id: 'lease', sha256: values.hashBytes('tools'), toolIds: ['read'] }] };
}

function testManifestHashes() {
  const built = manifest.build(input());
  assert.equal(manifest.verify(built), true);
  assert.deepEqual(built.payload.observedRuntime, { status: 'unknown', values: null, evidence: null });
  assert.equal(built.payload.workers[0].workerKind, 'procedure');
  const reordered = { ...input(), contract: { requirements: ['constraint'] } };
  assert.equal(manifest.create(reordered).hash, built.hash);
  const changed = structuredClone(built);
  changed.payload.requestedRuntime.model = 'invented';
  assert.throws(() => manifest.verify(changed), { code: 'TRINITY_MANIFEST_CORRUPT' });
  for (const field of ['originalMission', 'publicPrompt', 'verifier']) {
    assert.throws(() => manifest.compare(built, manifest.build({ ...input(), [field]: 'changed' })),
      { code: 'TRINITY_REPLAY_MANIFEST_CHANGED' });
  }
  assert.throws(() => manifest.build({ ...input(), contract: { invalid: NaN } }), { code: 'TRINITY_PROVENANCE_NON_JSON' });
  assert.throws(() => manifest.build({ ...input(), requestedRuntime: { authorization: 'secret' } }),
    { code: 'TRINITY_PROVENANCE_SENSITIVE_FIELD' });
  const rehashed = structuredClone(built);
  rehashed.payload.observedRuntime.values = { model: 'claimed' };
  const { hash, ...content } = rehashed;
  rehashed.hash = values.digest(content);
  assert.throws(() => manifest.verify(rehashed), { code: 'TRINITY_MANIFEST_INVALID_SHAPE' });
}

function testObservedRuntime() {
  const effective = { values: { model: 'actually-observed', budget: 8000 }, evidence: {
    source: 'runtime-observation.json', sha256: values.hashBytes('observation'), observedAt: stamp, emitter: 'runtime-launcher' } };
  const built = manifest.build({ ...input(), observedRuntime: effective });
  assert.equal(built.payload.requestedRuntime.model, 'requested');
  assert.equal(built.payload.observedRuntime.values.model, 'actually-observed');
  assert.throws(() => manifest.build({ ...input(), observedRuntime: { values: { model: 'requested' } } }),
    { code: 'TRINITY_MANIFEST_OBSERVATION_EVIDENCE_REQUIRED' });
  assert.throws(() => manifest.build({ ...input(), observedRuntime: { ...effective,
    evidence: { ...effective.evidence, emitter: 'model-report' } } }), { code: 'TRINITY_MANIFEST_UNTRUSTED_OBSERVATION_EMITTER' });
  const unknown = manifest.build({ ...input(), revision: { commit: null, dirtyHash: null, reason: 'GIT_UNAVAILABLE' } });
  assert.equal(unknown.payload.revision.status, 'unknown');
}

async function testManifestPersistence(db) {
  const built = manifest.build(input());
  await manifest.persist(db, built);
  assert.deepEqual(await manifest.read(db, input().correlation), built);
  assert.deepEqual(await manifest.persist(db, built), built);
  await assert.rejects(manifest.persist(db, manifest.build({ ...input(), contract: { changed: true } })),
    { code: 'TRINITY_REPLAY_MANIFEST_CHANGED' });
  await assert.rejects(db.run('UPDATE trinity_run_manifests SET manifest_hash=?', 'tampered'), /TRINITY_MANIFEST_IMMUTABLE/);
  await assert.rejects(db.run('INSERT OR REPLACE INTO trinity_run_manifests VALUES (?, ?, ?, ?)',
    ['mission', 'run', built.hash, values.encode(built)]), /TRINITY_MANIFEST_IMMUTABLE/);
}

function event(overrides = {}) {
  return { correlation: input().correlation, stage: 'execution', status: 'started', ...overrides };
}

async function testOrdering(db) {
  await assert.rejects(trace.append(db, event({ status: 'completed' })), { code: 'TRINITY_TRACE_INVALID_TRANSITION' });
  const first = await trace.append(db, event({ eventId: 'start' }));
  const same = await trace.append(db, event({ eventId: 'start' }));
  assert.equal(same.eventId, first.eventId);
  assert.equal(same.idempotentReplay, true);
  await assert.rejects(trace.append(db, event({ eventId: 'start', details: { changed: true } })), { code: 'TRINITY_TRACE_REPLAY_CHANGED' });
  const foreign = { ...input().correlation, tenantId: 'foreign' };
  await assert.rejects(trace.append(db, event({ correlation: foreign, status: 'completed' })), { code: 'TRINITY_TRACE_CORRELATION_CHANGED' });
  const completed = await trace.append(db, event({ status: 'completed', details: { result: { correct: true } } }));
  assert.equal(completed.missionSeq, 2);
  await assert.rejects(trace.append(db, event({ status: 'failed' })), { code: 'TRINITY_TRACE_INVALID_TRANSITION' });
  await assert.rejects(db.run('DELETE FROM trinity_trace_events'), /TRINITY_TRACE_APPEND_ONLY/);
  await assert.rejects(db.run('UPDATE trinity_trace_events SET status=?', 'completed'), /TRINITY_TRACE_APPEND_ONLY/);
}

async function testConcurrentWorlds(db) {
  const requests = Array.from({ length: 6 }, (_, index) => event({ stage: 'parallel',
    correlation: { ...input().correlation, worldId: `parallel-${index}` } }));
  const events = await Promise.all(requests.map(value => trace.append(db, value)));
  assert.equal(new Set(events.map(value => value.missionSeq)).size, 6);
  assert.deepEqual(events.map(value => value.worldSeq), [1, 1, 1, 1, 1, 1]);
  assert.equal((await trace.read(db, { missionId: 'mission' })).length, 8);
}

async function testReplay(db) {
  let calls = 0;
  const context = { db, ...input().correlation, stageId: 'replay', configuration: { manifestHash: 'bound' } };
  const execute = async () => { calls += 1; return { receipt: 'output-receipt' }; };
  const initial = await trace.executeStage(context, 'verify', execute);
  assert.deepEqual(await trace.executeStage(context, 'verify', execute), initial);
  assert.equal(calls, 1);
  const history = await trace.read(db, { missionId: 'mission', worldId: 'w1' });
  assert.equal(history.at(-1).status, 'replayed');
  await assert.rejects(trace.executeStage({ ...context, configuration: { manifestHash: 'changed' } }, 'verify', execute),
    { code: 'TRINITY_TRACE_REPLAY_CHANGED' });
  await trace.append(db, event({ stage: 'interrupted', details: { inputHash: values.digest(context.configuration) } }));
  await assert.rejects(trace.executeStage({ ...context, stageId: 'interrupted' }, 'interrupted', execute),
    { code: 'TRINITY_TRACE_INCOMPLETE_STAGE' });
}

async function testFailureAndObservation(db) {
  const context = { db, ...input().correlation };
  let calls = 0;
  const execute = async () => { calls += 1; throw Object.assign(new Error('secret should not be stored'), { code: 'EXPECTED_FAILURE' }); };
  await assert.rejects(trace.executeStage(context, 'failure', execute), { code: 'EXPECTED_FAILURE' });
  await assert.rejects(trace.executeStage(context, 'failure', execute), { code: 'EXPECTED_FAILURE' });
  assert.equal(calls, 1);
  const observedInput = event({ eventId: 'observation', stage: 'supervisor', details: { runtimeStatus: 'sealed_running', pidObserved: false } });
  const observation = await trace.observe(db, observedInput);
  assert.equal((await trace.observe(db, observedInput)).eventId, observation.eventId);
  assert.equal(observation.status, 'observed');
  assert.equal(observation.details.cutoff.missionSeq, observation.missionSeq - 1);
  const rows = await trace.read(db, { missionId: 'mission', cutoff: observation.details.cutoff.missionSeq });
  assert.ok(rows.every(row => row.missionSeq < observation.missionSeq));
  assert.ok(!JSON.stringify(rows).includes('secret should not be stored'));
}

async function testConcurrentConnections(root) {
  const filename = path.join(root, 'trace.db');
  const left = await sqlite.open({ filename, driver: sqlite3.Database });
  const right = await sqlite.open({ filename, driver: sqlite3.Database });
  try {
    await left.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;');
    await right.exec('PRAGMA busy_timeout=3000;');
    await trace.initialize(left);
    await trace.initialize(right);
    const requests = Array.from({ length: 12 }, (_, index) => ({ db: index % 2 ? left : right,
      event: event({ stage: 'connection', stageId: `connection-${index}` }) }));
    const events = await Promise.all(requests.map(value => trace.append(value.db, value.event)));
    assert.equal(new Set(events.map(value => value.missionSeq)).size, 12);
    assert.equal((await trace.read(right, { missionId: 'mission' })).length, 12);
  } finally { await left.close(); await right.close(); }
}

async function testBackup(root) {
  const db = await sqlite.open({ filename: path.join(root, 'live.db'), driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA journal_mode=WAL; CREATE TABLE evidence (value TEXT);');
    await db.run('INSERT INTO evidence VALUES (?)', 'committed-in-wal');
    const captured = await trace.captureDatabase(db, { path: path.join(root, 'capture.db'), allowedRoot: root, cutoff: 3 });
    assert.equal(captured.sha256, values.hashBytes(await fs.readFile(captured.path)));
    const snapshot = await sqlite.open({ filename: captured.path, driver: sqlite3.Database });
    try { assert.equal((await snapshot.get('SELECT value FROM evidence')).value, 'committed-in-wal'); }
    finally { await snapshot.close(); }
    await assert.rejects(trace.captureDatabase(db, { path: captured.path, allowedRoot: root }), { code: 'TRINITY_TRACE_SNAPSHOT_EXISTS' });
    await assert.rejects(trace.captureDatabase(db, { path: path.join(root, '..', 'outside.db'), allowedRoot: root }),
      { code: 'TRINITY_TRACE_SNAPSHOT_OUTSIDE_ROOT' });
  } finally { await db.close(); }
}

async function main() {
  testManifestHashes();
  testObservedRuntime();
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-trinity-l1-'));
  try {
    await testManifestPersistence(db);
    await testOrdering(db);
    await testConcurrentWorlds(db);
    await testReplay(db);
    await testFailureAndObservation(db);
    await testConcurrentConnections(root);
    await testBackup(root);
    console.log('Trinity L1 canonical manifest, immutable provenance, ordered correlation, replay and WAL backup: PASS');
  } finally { await db.close(); await fs.rm(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
