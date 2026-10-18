'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { execFileSync } = require('node:child_process');
const { createFabric } = require('../../backend/src/services/gqwf');
const bench = require('../gqwf-overlays/run.cjs');

const PORTABLE = 'portable-copy-v1';
const DEFAULT_BACKENDS = ['native-reflink-v1', 'linux-overlayfs-v1'];

function bounded(value, range) {
  const parsed = Number(value);
  assert(Number.isSafeInteger(parsed) && parsed >= range.minimum && parsed <= range.maximum);
  return parsed;
}

function backendList(value) {
  const entries = String(value).split(',').filter(Boolean);
  assert(entries.length > 0 && entries.length <= 8);
  assert(entries.every((entry) => /^[a-z0-9][a-z0-9-]{2,63}$/.test(entry)));
  assert.equal(new Set(entries).size, entries.length);
  return entries.filter((entry) => entry !== PORTABLE);
}

function options(argv) {
  assert(argv.every((arg) => /^--(?:files|bytes|repetitions|backends)=[a-z0-9,-]+$/.test(arg)));
  const values = Object.fromEntries(argv.map((arg) => arg.split('=', 2)));
  return {
    files: bounded(values['--files'] || 8, { minimum: 1, maximum: 256 }),
    bytes: bounded(values['--bytes'] || 4096, { minimum: 1, maximum: 1048576 }),
    repetitions: bounded(values['--repetitions'] || 3, { minimum: 3, maximum: 20 }),
    backends: backendList(values['--backends'] || DEFAULT_BACKENDS.join(','))
  };
}

async function timed(operation) {
  const start = performance.now();
  const result = await operation();
  return { result, ms: performance.now() - start };
}

function metrics(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const totalMs = values.reduce((sum, value) => sum + value, 0);
  return { count: values.length, totalMs, meanMs: totalMs / values.length,
    p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] };
}

function distribution(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return { count: values.length, minimum: sorted[0],
    median: sorted[Math.ceil(sorted.length * 0.5) - 1], maximum: sorted.at(-1) };
}

async function createResource(config, runtime, materializerId) {
  const resource = await bench.fixture({ ...config, views: 1, materializations: 1 });
  resource.fabric = createFabric(resource.db,
    { materializers: runtime.materializers, materializerId });
  return resource;
}

async function destroyResource(resource) {
  await resource.db.close();
  await bench.removeFixture(resource.directory);
}

async function inspectBackends(config, runtime) {
  const resource = await createResource(config, runtime);
  try {
    return await resource.fabric.inspectMaterializers({ workspaceId: 'bench' });
  } finally {
    await destroyResource(resource);
  }
}

async function mutateProjection(root, config) {
  await fs.writeFile(path.join(root, 'file-0000.txt'), bench.content(10000, config.bytes));
  await fs.writeFile(path.join(root, 'benchmark-output.txt'), 'gqwf-materializer-paired-v1');
}

async function releaseIfOpen(resource, lease) {
  if (!lease) return;
  await resource.fabric.releaseLease({ workspaceId: 'bench', leaseId: lease.leaseId });
}

async function executeArm(config, backendId, runtime) {
  const resource = await createResource(config, runtime, backendId);
  let lease = null;
  try {
    const imported = await resource.fabric.importBase({ workspaceId: 'bench' });
    const created = await timed(() => resource.fabric.materializeRoot(
      { workspaceId: 'bench', rootHash: imported.rootHash }));
    lease = created.result;
    const projection = await bench.treeStats(lease.path);
    const mutation = await timed(() => mutateProjection(lease.path, config));
    const captured = await timed(() => resource.fabric.ingestLease(
      { workspaceId: 'bench', leaseId: lease.leaseId }));
    const released = await timed(() => resource.fabric.releaseLease(
      { workspaceId: 'bench', leaseId: lease.leaseId }));
    assert.equal(released.result.released, true);
    lease = null;
    return { backendId, baseRootHash: imported.rootHash,
      candidateRootHash: captured.result.rootHash, candidateFileCount: captured.result.fileCount,
      projectedFiles: projection.files, projectedBytes: projection.bytes,
      materializeMs: created.ms, mutateMs: mutation.ms, captureMs: captured.ms,
      releaseMs: released.ms, totalMs: created.ms + mutation.ms + captured.ms + released.ms };
  } finally {
    await releaseIfOpen(resource, lease);
    await destroyResource(resource);
  }
}

async function pairedRun(config, input) {
  const order = input.index % 2 === 0 ? [input.backendId, PORTABLE] : [PORTABLE, input.backendId];
  const arms = {};
  for (const backendId of order) arms[backendId] = await executeArm(config, backendId, input.runtime);
  return { candidateBackend: input.backendId, repetition: input.index + 1, order, arms };
}

function semanticParity(pair) {
  const baseline = pair.arms[PORTABLE];
  const candidate = pair.arms[pair.candidateBackend];
  return baseline.baseRootHash === candidate.baseRootHash
    && baseline.candidateRootHash === candidate.candidateRootHash
    && baseline.candidateFileCount === candidate.candidateFileCount;
}

function summarizeBackend(backendId, pairs) {
  const selected = pairs.filter((pair) => pair.candidateBackend === backendId);
  const portable = selected.map((pair) => pair.arms[PORTABLE].totalMs);
  const candidate = selected.map((pair) => pair.arms[backendId].totalMs);
  const parity = selected.every(semanticParity);
  return { backendId, status: parity ? 'qualified' : 'semantic_mismatch', semanticParity: parity,
    portableTotal: metrics(portable), candidateTotal: metrics(candidate),
    portableToCandidateRatio: distribution(portable.map((value, index) => value / candidate[index])) };
}

function capabilityMap(inspected) {
  return new Map(inspected.map((item) => [item.backendId, item]));
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

async function runProtocol(config, runtime = {}) {
  const inspected = await inspectBackends(config, runtime);
  const capabilities = capabilityMap(inspected);
  const baseline = capabilities.get(PORTABLE);
  if (!baseline?.available) throw new Error('Portable GQWF materializer is unavailable.');
  const available = config.backends.filter((backendId) => capabilities.get(backendId)?.available);
  const skipped = config.backends.filter((backendId) => !available.includes(backendId))
    .map((backendId) => ({ backendId,
      reason: capabilities.get(backendId)?.unavailableReason || 'backend_unregistered' }));
  const pairs = [];
  for (const backendId of available) {
    for (let index = 0; index < config.repetitions; index += 1) {
      pairs.push(await pairedRun(config, { backendId, index, runtime }));
    }
  }
  const summary = available.map((backendId) => summarizeBackend(backendId, pairs));
  const semanticParityMet = summary.length > 0 && summary.every((item) => item.semanticParity);
  return { protocol: 'gqwf-materializer-paired-v1', ...gitState(),
    environment: { platform: process.platform, arch: process.arch, node: process.version,
      cpu: os.cpus()[0]?.model || null, logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem() },
    config, inspected, skipped, pairs, summary,
    qualification: { status: summary.length === 0 ? 'unavailable'
      : semanticParityMet ? 'qualified' : 'failed',
    semanticParity: summary.length === 0 ? null : semanticParityMet,
    minimumRepetitionsMet: config.repetitions >= 3, performanceClaim: 'none',
    runtimePromotionAuthorized: false, autoPolicyChanged: false } };
}

async function main() {
  const report = await runProtocol(options(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

module.exports = { DEFAULT_BACKENDS, PORTABLE, options, runProtocol };

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
