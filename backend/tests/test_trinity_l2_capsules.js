const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const capsules = require('../src/services/agentCapsuleService');
const gate = require('../src/services/agentCapsuleGate');
const seals = require('../src/services/trinityCapsuleSeal');
const secure = require('../src/services/trinityCapsulePaths');
const payload = require('../src/services/workspaceSnapshotPayload');
const collect = require('../src/services/workspaceSnapshotCollect');
const snapshotPaths = require('../src/services/workspaceSnapshotPaths');
const { buildAgentRuntimePrompt } = require('../bin/agent-runtime-prompt.cjs');

function input(root, runId = 'run-1') {
  return { capsuleRoot: root, workspaceRoot: path.join(root, 'workspace'), agentId: 'worker-1', name: 'Worker', role: 'Verifier',
    correlation: { missionId: 'mission-1', worldId: 'world-1', workerId: 'worker-1', runId } };
}

async function testReprise(root) {
  const request = input(root);
  const first = await capsules.provisionSynthetic(request);
  assert.equal(first.bootstrapMode, 'synthetic');
  assert.equal((await seals.verify(first)).payload.capsule.id, first.id);
  assert.deepEqual(await capsules.provisionSynthetic(request), first);
  await assert.rejects(capsules.provisionSynthetic({ ...request, role: 'Different' }), /reprise inputs changed/);
  const second = await capsules.provisionSynthetic(input(root, 'run-2'));
  assert.notEqual(second.root, first.root);
  const changedWorld = { ...request, correlation: { ...request.correlation, worldId: 'world-2' } };
  assert.notEqual(gate.resolveCapsulePaths(changedWorld).root, first.root);
  await assert.rejects(capsules.provisionSynthetic({ ...request, agentId: 'other' }), /identity mismatch/);
  await assert.rejects(capsules.provisionSynthetic({ ...request, correlation: { ...request.correlation, runId: '' } }), /runId/);
  return first;
}

async function testTampering(first) {
  const bytes = await fs.readFile(first.genomePath);
  await fs.writeFile(first.genomePath, '{}');
  await assert.rejects(seals.verify(first), /was altered/);
  await fs.writeFile(first.genomePath, bytes);
  await assert.rejects(seals.verify({ ...first, snapshotId: 'invented' }), /descriptor mismatch/);
  const original = await fs.readFile(first.sealPath);
  const changed = JSON.parse(original);
  changed.payload.specHash = 'altered';
  await fs.writeFile(first.sealPath, JSON.stringify(changed));
  await assert.rejects(seals.verify(first), /seal was altered/);
  await fs.writeFile(first.sealPath, original);
}

async function testLinksAndPartial(root) {
  const external = path.join(root, 'outside');
  await fs.mkdir(external);
  const link = path.join(root, 'linked');
  await fs.symlink(external, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(capsules.provisionSynthetic(input(link)), /symbolic link or junction/);
  const request = input(root, 'partial');
  const resolved = gate.resolveCapsulePaths(request);
  await fs.mkdir(resolved.root, { recursive: true });
  await assert.rejects(capsules.provisionSynthetic(request), /Unsealed capsule exists/);
  assert.equal(await fs.readFile(path.join(root, 'outside', 'sentinel')).catch(() => null), null);
}

async function testFallback(root) {
  const request = { ...input(root, 'native-fail'), executable: process.execPath };
  await assert.rejects(capsules.provision(request), /bootstrap failed/);
  const fallback = await capsules.provision({ ...input(root, 'fallback'), executable: process.execPath, fallbackSynthetic: true });
  assert.equal(fallback.bootstrapMode, 'synthetic');
  assert.match(fallback.fallbackReason, /bootstrap failed/);
  assert.equal((await seals.verify(fallback)).payload.capsule.bootstrapMode, 'synthetic');
}

async function testNative(root) {
  const request = { ...input(root, 'native-cli'), executable: process.env.GENOS_L2_NATIVE_BIN };
  const capsule = await capsules.provision(request);
  assert.equal(capsule.bootstrapMode, 'native');
  assert.equal(capsule.fallbackReason, null);
  assert.ok(capsule.capsulePath.startsWith(capsule.root + path.sep));
  const persisted = JSON.parse(await fs.readFile(capsule.capsulePath, 'utf8'));
  assert.equal(persisted.capsule_id, capsule.id);
  assert.deepEqual(await capsules.provision(request), capsule);
  await fs.writeFile(capsule.capsulePath, '{}');
  await assert.rejects(seals.verify(capsule), /was altered/);
  console.log('Trinity L2 real Rust CLI capsule creation and persistence checks passed.');
}

function testPrompt(first) {
  const text = buildAgentRuntimePrompt({ selfIntro: 'worker', mission: { workspaceRoot: first.root, role: 'Verifier', prompt: 'Run proof' },
    genosCapsule: first, strategyContract: {}, runtimeContract: {}, autonomyPlan: {}, runtimeAutonomyPlan: {},
    toolLease: [], isWorker: false, executionPolicy: {}, allowedCommands: [] });
  assert.ok(text.includes(`Capsule ID: ${first.id}.`));
  assert.ok(text.includes(`Genome: ${first.genomePath}`));
  assert.ok(text.includes(`Snapshot: ${first.snapshotPath}`));
  assert.equal(text.includes(`${first.id}_run_`), false);
}

async function testSnapshots(root) {
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'proof.txt'), 'Evidence');
  const files = await collect.collectFiles(workspace);
  const hash = collect.manifestHash(files);
  const freshRoot = path.join(root, 'missing', 'workspace-snapshots');
  const options = { workspacePath: workspace, root: freshRoot, files, hash };
  await assert.rejects(payload.copyManifestPayload({ ...options, hash: '../outside' }), /content hash/);
  const stored = await payload.copyManifestPayload(options);
  assert.equal(await fs.readFile(path.join(stored, 'proof.txt'), 'utf8'), 'Evidence');
  assert.equal(await payload.copyManifestPayload(options), stored);
  await testSnapshotExtras(options, stored, root);
  await fs.writeFile(path.join(stored, 'proof.txt'), 'Altered');
  await assert.rejects(payload.copyManifestPayload(options), /payload was altered/);
  const linked = path.join(root, 'snapshot-link');
  await fs.symlink(freshRoot, linked, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(payload.copyManifestPayload({ ...options, root: linked }), /symbolic link or junction/);
  await testCaptureDatabase(workspace);
}

async function testSnapshotExtras(options, stored, root) {
  const extra = path.join(stored, '.env');
  await fs.writeFile(extra, 'Undeclared fixture; no secret');
  await assert.rejects(payload.copyManifestPayload(options), /undeclared file/);
  await fs.unlink(extra);
  const extraDir = path.join(stored, 'unlisted');
  await fs.mkdir(extraDir);
  await assert.rejects(payload.copyManifestPayload(options), /undeclared directory/);
  await fs.rmdir(extraDir);
  await fs.symlink(options.workspacePath, extraDir, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(payload.copyManifestPayload(options), /symbolic link or junction/);
  await fs.unlink(extraDir);
  const manifestPath = path.join(path.dirname(stored), 'manifest.json');
  await fs.rename(manifestPath, manifestPath + '.saved');
  await fs.symlink(root, manifestPath, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(payload.copyManifestPayload(options), /symbolic link or junction/);
  await fs.unlink(manifestPath);
  await fs.rename(manifestPath + '.saved', manifestPath);
}

async function testManifestShape(root) {
  const integrity = require('../src/services/trinityCapsuleSnapshot');
  const file = { path: 'proof.txt', size: 8, mode: 0o644, hash: collect.sha256('Evidence') };
  const cases = [
    { files: [file], version: 2, message: /manifest shape/ },
    { files: [file, file], version: 1, message: /Duplicate/ },
    { files: [{ ...file, path: '../outside' }], version: 1, message: /payload path/ },
    { files: [{ ...file, hash: 'invalid' }], version: 1, message: /file hash/ },
    { files: [{ ...file, size: -1 }], version: 1, message: /file size/ },
    { files: [{ ...file, size: 128 * 1024 * 1024 + 1 }], version: 1, message: /byte count/ }
  ];
  for (const item of cases) {
    const hash = collect.manifestHash(item.files);
    const target = path.join(root, 'shape', hash);
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, 'manifest.json'), JSON.stringify({ files: item.files, version: item.version, hash }));
    await assert.rejects(integrity.verify(path.join(root, 'shape'), hash), item.message);
  }
  await testManifestCount(root, file);
}

async function testManifestCount(root, file) {
  const integrity = require('../src/services/trinityCapsuleSnapshot');
  const files = [file, { ...file, path: 'second.txt' }];
  const hash = collect.manifestHash(files);
  const target = path.join(root, 'count', hash);
  await fs.mkdir(target, { recursive: true });
  await fs.writeFile(path.join(target, 'manifest.json'), JSON.stringify({ version: 1, hash, files }));
  const previous = process.env.GENOS_MAX_SNAPSHOT_FILES;
  process.env.GENOS_MAX_SNAPSHOT_FILES = '1';
  try { await assert.rejects(integrity.verify(path.join(root, 'count'), hash), /file count/); }
  finally { if (previous === undefined) delete process.env.GENOS_MAX_SNAPSHOT_FILES; else process.env.GENOS_MAX_SNAPSHOT_FILES = previous; }
}

async function testSealAnchor(root) {
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const request = { ...input(root, 'anchored'), db };
    const capsule = await capsules.provisionSynthetic(request);
    assert.deepEqual(await capsules.provisionSynthetic(request), capsule);
    await assert.rejects(db.run('DELETE FROM trinity_capsule_seals'), /immutable/);
    await assert.rejects(db.run('UPDATE trinity_capsule_seals SET seal_hash = ?', 'forged'), /immutable/);
    await assert.rejects(db.run('INSERT OR REPLACE INTO trinity_capsule_seals SELECT * FROM trinity_capsule_seals'), /immutable/);
    const seal = JSON.parse(await fs.readFile(capsule.sealPath, 'utf8'));
    seal.payload.specHash = 'forged';
    seal.hash = secure.hash(seal.payload);
    await fs.writeFile(capsule.sealPath, JSON.stringify(seal));
    await assert.rejects(capsules.provisionSynthetic(request), /database seal anchor mismatch/);
  } finally { await db.close(); }
}

async function testConcurrent(root) {
  const request = input(root, 'concurrent');
  const results = await Promise.allSettled([capsules.provisionSynthetic(request), capsules.provisionSynthetic(request)]);
  const successes = results.filter(result => result.status === 'fulfilled');
  assert.ok(successes.length >= 1);
  const winner = successes[0].value;
  for (const result of successes) assert.deepEqual(result.value, winner);
  const retry = await capsules.provisionSynthetic(request);
  assert.deepEqual(retry, winner);
}

async function testCaptureDatabase(workspace) {
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec('CREATE TABLE workspace_snapshots(id TEXT PRIMARY KEY, workspace_id TEXT, snapshot_hash TEXT, step_number INTEGER, label TEXT, author TEXT, reason TEXT, diff_summary TEXT, metadata TEXT)');
    const first = await payload.capture({ db, workspace: { id: 'ws', path: workspace }, agentId: 'worker' });
    const second = await payload.capture({ db, workspace: { id: 'ws', path: workspace }, agentId: 'worker' });
    assert.equal(first.snapshotHash, second.snapshotHash);
    assert.equal(second.stepNumber, 2);
    assert.equal((await db.get('SELECT COUNT(*) AS total FROM workspace_snapshots')).total, 2);
  } finally { await db.close(); }
}

function testSnapshotConfinement() {
  const previous = process.env.GENOS_SNAPSHOT_ROOT;
  process.env.GENOS_SNAPSHOT_ROOT = os.tmpdir();
  try { assert.throws(() => snapshotPaths.snapshotRoot('.', '../outside'), /Invalid snapshot/); }
  finally { if (previous === undefined) delete process.env.GENOS_SNAPSHOT_ROOT; else process.env.GENOS_SNAPSHOT_ROOT = previous; }
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trinity-l2-capsules-'));
  try {
    const first = await testReprise(root);
    await testTampering(first);
    await testLinksAndPartial(root);
    await testFallback(root);
    await testSealAnchor(root);
    await testConcurrent(root);
    if (process.env.GENOS_L2_NATIVE_BIN) await testNative(root);
    testPrompt(first);
    await testSnapshots(root);
    await testManifestShape(root);
    testSnapshotConfinement();
    secure.contained(root, first.root);
    console.log('Trinity L2 capsule, reprise, confinement, prompt and SQLite snapshot checks passed.');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
