'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { execFileSync } = require('node:child_process');
const bench = require('./run.cjs');

const OVERLAY = 'same-overlay-content-v1';

function bounded(value, range) {
  const parsed = Number(value);
  assert(Number.isSafeInteger(parsed) && parsed >= range.minimum && parsed <= range.maximum);
  return parsed;
}

function options(argv) {
  assert(argv.every((arg) => /^--(?:views|files|bytes|repetitions)=\d+$/.test(arg)));
  const values = Object.fromEntries(argv.map((arg) => arg.split('=', 2)));
  return {
    views: bounded(values['--views'] || 10, { minimum: 1, maximum: 1000 }),
    files: bounded(values['--files'] || 8, { minimum: 1, maximum: 256 }),
    bytes: bounded(values['--bytes'] || 1024, { minimum: 1, maximum: 1048576 }),
    repetitions: bounded(values['--repetitions'] || 3, { minimum: 3, maximum: 20 })
  };
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

function distribution(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return { count: values.length, minimum: sorted[0], median: sorted[Math.ceil(values.length * 0.5) - 1],
    maximum: sorted[sorted.length - 1] };
}

async function seedSource(directory, config) {
  const source = path.join(directory, 'source');
  await fs.mkdir(source);
  for (let index = 0; index < config.files; index++) {
    const name = `file-${String(index).padStart(4, '0')}.txt`;
    await fs.writeFile(path.join(source, name), bench.content(index, config.bytes));
  }
  return source;
}

async function removePhysicalFixture(directory) {
  const target = path.resolve(directory);
  assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
  assert.match(path.basename(target), /^genos-gqwf-physical-[A-Za-z0-9]+$/);
  const stat = await fs.lstat(target);
  assert(stat.isDirectory() && !stat.isSymbolicLink());
  await fs.rm(target, { recursive: true, force: true });
}

async function createPhysicalCopies(state) {
  const durations = [];
  for (let index = 0; index < state.config.views; index++) {
    const target = path.join(state.copies, `view-${String(index).padStart(4, '0')}`);
    const sample = await timed(() => fs.cp(state.source, target,
      { recursive: true, force: false, errorOnExist: true }));
    durations.push(sample.ms);
  }
  return metrics(durations);
}

async function writePhysicalOverlays(state) {
  const durations = [];
  for (let index = 0; index < state.config.views; index++) {
    const target = path.join(state.copies, `view-${String(index).padStart(4, '0')}`, 'shared.txt');
    const sample = await timed(() => fs.writeFile(target, OVERLAY));
    durations.push(sample.ms);
  }
  return metrics(durations);
}

async function verifyPhysical(state) {
  for (const index of [0, state.config.views - 1]) {
    const root = path.join(state.copies, `view-${String(index).padStart(4, '0')}`);
    assert.equal(await fs.readFile(path.join(root, 'shared.txt'), 'utf8'), OVERLAY);
    assert.deepEqual(await fs.readFile(path.join(root, 'file-0000.txt')),
      bench.content(0, state.config.bytes));
  }
}

async function physicalArm(config) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-gqwf-physical-'));
  try {
    const source = await seedSource(directory, config);
    const copies = path.join(directory, 'copies');
    await fs.mkdir(copies);
    const state = { config, source, copies };
    const copy = await createPhysicalCopies(state);
    const overlay = await writePhysicalOverlays(state);
    await verifyPhysical(state);
    const content = await bench.treeStats(copies);
    assert.equal(content.files, config.views * (config.files + 1));
    assert.equal(content.bytes, config.views * ((config.files * config.bytes) + Buffer.byteLength(OVERLAY)));
    return { copy, overlay, totalMs: copy.totalMs + overlay.totalMs, content };
  } finally {
    await removePhysicalFixture(directory);
  }
}

async function gqwfArm(config) {
  const resource = await bench.fixture({ ...config, materializations: 1 });
  try {
    const imported = await timed(() => resource.fabric.importBase({ workspaceId: 'bench' }));
    const afterImport = await bench.footprint(resource);
    const forked = await bench.createViews(resource, config, imported.result.rootHash);
    const afterViews = await bench.footprint(resource);
    assert.equal(afterViews.blobBytes, afterImport.blobBytes);
    const overlay = await bench.writeSharedOverlay(resource, forked.views);
    const afterOverlay = await bench.footprint(resource);
    assert.equal(afterOverlay.blobBytes, (config.files * config.bytes) + Buffer.byteLength(OVERLAY));
    return { importBaseMs: imported.ms, createViews: forked.timing, overlay,
      totalMs: imported.ms + forked.timing.totalMs + overlay.totalMs,
      content: { files: afterOverlay.blobCount, bytes: afterOverlay.blobBytes },
      sqlitePhysicalBytes: afterOverlay.sqlitePhysicalBytes };
  } finally {
    await resource.db.close();
    await bench.removeFixture(resource.directory);
  }
}

async function pairedRun(config, index) {
  const order = index % 2 === 0 ? ['physical', 'gqwf'] : ['gqwf', 'physical'];
  const result = { repetition: index + 1, order };
  for (const arm of order) result[arm] = arm === 'physical' ? await physicalArm(config) : await gqwfArm(config);
  assert.equal(result.physical.content.bytes,
    config.views * ((config.files * config.bytes) + Buffer.byteLength(OVERLAY)));
  assert.equal(result.gqwf.content.bytes, (config.files * config.bytes) + Buffer.byteLength(OVERLAY));
  return result;
}

function summarize(pairs) {
  const physical = metrics(pairs.map((pair) => pair.physical.totalMs));
  const gqwf = metrics(pairs.map((pair) => pair.gqwf.totalMs));
  const contentRatios = pairs.map((pair) => pair.physical.content.bytes / pair.gqwf.content.bytes);
  return { physicalTotal: physical, gqwfTotal: gqwf,
    physicalToGqwfContentRatio: distribution(contentRatios) };
}

function gitState() {
  const cwd = path.resolve(__dirname, '../..');
  try {
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
    const checkoutDirty = execFileSync('git', ['status', '--porcelain'],
      { cwd, encoding: 'utf8' }).trim().length > 0;
    return { revision, checkoutDirty };
  } catch (_) { return { revision: null, checkoutDirty: null }; }
}

async function runProtocol(config) {
  const pairs = [];
  for (let index = 0; index < config.repetitions; index++) pairs.push(await pairedRun(config, index));
  return { protocol: 'gqwf-cow-paired-v1', ...gitState(),
    environment: { platform: process.platform, arch: process.arch, node: process.version,
      cpu: os.cpus()[0]?.model || null, logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem() },
    config, qualification: { semanticParity: true, minimumRepetitionsMet: config.repetitions >= 3,
      performanceClaim: 'none' }, pairs, summary: summarize(pairs) };
}

async function main() {
  const report = await runProtocol(options(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

module.exports = { options, physicalArm, gqwfArm, pairedRun, runProtocol };

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
