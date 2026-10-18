'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { execFileSync } = require('node:child_process');
const sqlite = require('../../backend/node_modules/sqlite');
const sqlite3 = require('../../backend/node_modules/sqlite3');
const { createFabric, migrateGqwf } = require('../../backend/src/services/gqwf');

function bounded(value, minimum, maximum) {
  const parsed = Number(value);
  assert(Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum);
  return parsed;
}

function options(argv) {
  const values = Object.fromEntries(argv.map((arg) => arg.split('=', 2)));
  assert(argv.every((arg) => /^--(?:views|files|bytes|materializations)=\d+$/.test(arg)));
  return {
    views: bounded(values['--views'] || 10, 1, 1000),
    files: bounded(values['--files'] || 8, 1, 256),
    bytes: bounded(values['--bytes'] || 1024, 1, 1048576),
    materializations: bounded(values['--materializations'] || 3, 1, 10)
  };
}

function content(index, size) {
  const seed = crypto.createHash('sha256').update(`gqwf-overlays-v1:${index}`).digest();
  const bytes = Buffer.alloc(size);
  for (let offset = 0; offset < size; offset += seed.length) {
    seed.copy(bytes, offset, 0, Math.min(seed.length, size - offset));
  }
  return bytes;
}

async function fixture(config) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-gqwf-bench-'));
  const workspace = path.join(directory, 'workspace');
  await fs.mkdir(workspace);
  for (let index = 0; index < config.files; index++) {
    await fs.writeFile(path.join(workspace, `file-${String(index).padStart(4, '0')}.txt`), content(index, config.bytes));
  }
  const filename = path.join(directory, 'gqwf.sqlite');
  const db = await sqlite.open({ filename, driver: sqlite3.Database });
  await db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT NOT NULL, organization_id TEXT, project_id TEXT);`);
  await db.run("INSERT INTO workspaces (id, path) VALUES ('bench', ?)", workspace);
  await migrateGqwf(db);
  return { directory, workspace, filename, db, fabric: createFabric(db) };
}

async function treeStats(root) {
  let entries;
  try { entries = await fs.readdir(root, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return { files: 0, bytes: 0 }; throw error; }
  const total = { files: 0, bytes: 0 };
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    assert(!entry.isSymbolicLink());
    if (entry.isDirectory()) {
      const child = await treeStats(target);
      total.files += child.files;
      total.bytes += child.bytes;
    } else {
      assert(entry.isFile());
      total.files++;
      total.bytes += (await fs.stat(target)).size;
    }
  }
  return total;
}

async function sqliteBytes(filename) {
  let total = 0;
  for (const suffix of ['', '-wal', '-shm']) {
    try { total += (await fs.stat(filename + suffix)).size; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return total;
}

async function footprint(resource) {
  const blobs = await treeStats(path.join(resource.workspace, '.genos', 'gqwf', 'blobs'));
  return { blobCount: blobs.files, blobBytes: blobs.bytes,
    sqlitePhysicalBytes: await sqliteBytes(resource.filename),
    sampledRssBytes: process.memoryUsage().rss, sampledHeapUsedBytes: process.memoryUsage().heapUsed };
}

async function timed(operation) {
  const start = performance.now();
  const result = await operation();
  return { result, ms: performance.now() - start };
}

function metrics(durations) {
  const sorted = [...durations].sort((left, right) => left - right);
  const totalMs = durations.reduce((sum, value) => sum + value, 0);
  return { count: durations.length, totalMs, meanMs: totalMs / durations.length,
    p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] };
}

async function createViews(resource, config, rootHash) {
  const views = [];
  const durations = [];
  for (let index = 0; index < config.views; index++) {
    const sample = await timed(() => resource.fabric.createView({ workspaceId: 'bench', baseHash: rootHash }));
    views.push(sample.result);
    durations.push(sample.ms);
  }
  assert.equal((await resource.db.get('SELECT COUNT(*) AS count FROM gqwf_views')).count, config.views);
  return { views, timing: metrics(durations) };
}

async function writeSharedOverlay(resource, views) {
  const durations = [];
  for (const view of views) {
    const sample = await timed(() => resource.fabric.writeFile({ workspaceId: 'bench', viewId: view.id,
      path: 'shared.txt', content: 'same-overlay-content-v1', expectedVersion: 0 }));
    assert.equal(sample.result, 1);
    durations.push(sample.ms);
  }
  for (const view of [views[0], views[views.length - 1]]) {
    const value = await resource.fabric.readFile({ workspaceId: 'bench', viewId: view.id, path: 'shared.txt' });
    assert.equal(value.toString(), 'same-overlay-content-v1');
  }
  return metrics(durations);
}

async function materializeSamples(resource, config, rootHash) {
  const creation = [];
  const release = [];
  let bytes = null;
  for (let index = 0; index < config.materializations; index++) {
    const sample = await timed(() => resource.fabric.materializeRoot({ workspaceId: 'bench', rootHash }));
    creation.push(sample.ms);
    const tree = await treeStats(sample.result.path);
    assert.equal(tree.files, config.files + 2);
    bytes = tree.bytes;
    const cleanup = await timed(() => resource.fabric.releaseLease({ workspaceId: 'bench', leaseId: sample.result.leaseId }));
    assert.equal(cleanup.result.released, true);
    release.push(cleanup.ms);
  }
  return { materialization: metrics(creation), release: metrics(release), leaseLogicalBytes: bytes };
}

async function run(resource, config) {
  const imported = await timed(() => resource.fabric.importBase({ workspaceId: 'bench' }));
  assert.equal(imported.result.fileCount, config.files);
  const afterImport = await footprint(resource);
  assert.equal(afterImport.blobCount, config.files);
  const forked = await createViews(resource, config, imported.result.rootHash);
  const afterViews = await footprint(resource);
  assert.equal(afterViews.blobCount, afterImport.blobCount);
  assert.equal(afterViews.blobBytes, afterImport.blobBytes);
  const overlay = await writeSharedOverlay(resource, forked.views);
  const afterOverlay = await footprint(resource);
  assert.equal(afterOverlay.blobCount, config.files + 1);
  assert.equal(afterOverlay.blobBytes, afterImport.blobBytes + Buffer.byteLength('same-overlay-content-v1'));
  const sealed = await timed(() => resource.fabric.sealView({ workspaceId: 'bench',
    viewId: forked.views[0].id, expectedVersion: 1 }));
  const physical = await materializeSamples(resource, config, sealed.result.rootHash);
  const afterMaterialization = await footprint(resource);
  assert.equal(afterMaterialization.blobCount, config.files + 1);
  return { importBaseMs: imported.ms, createViews: forked.timing, writeSharedOverlay: overlay,
    sealViewMs: sealed.ms, ...physical,
    footprint: { afterImport, afterViews, afterOverlay, afterMaterialization } };
}

async function removeFixture(directory) {
  const target = path.resolve(directory);
  assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
  assert.match(path.basename(target), /^genos-gqwf-bench-[A-Za-z0-9]+$/);
  const stat = await fs.lstat(target);
  assert(stat.isDirectory() && !stat.isSymbolicLink());
  await fs.rm(target, { recursive: true, force: true });
}

function gitState() {
  const cwd = path.resolve(__dirname, '../..');
  try {
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).trim().length > 0;
    return { revision, checkoutDirty: dirty };
  } catch { return { revision: null, checkoutDirty: null }; }
}

async function main() {
  const config = options(process.argv.slice(2));
  const resource = await fixture(config);
  try {
    const result = await run(resource, config);
    process.stdout.write(`${JSON.stringify({ protocol: 'gqwf-overlays-v1', ...gitState(),
      environment: { platform: process.platform, arch: process.arch, node: process.version,
        cpu: os.cpus()[0]?.model || null, logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem(),
        sqlite: 'file/WAL/synchronous=NORMAL' }, config, result }, null, 2)}\n`);
  } finally {
    await resource.db.close();
    await removeFixture(resource.directory);
  }
}

module.exports = { fixture, createViews, removeFixture, footprint, writeSharedOverlay, content, treeStats };

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
