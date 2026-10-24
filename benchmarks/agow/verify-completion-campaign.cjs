'use strict';

const fs = require('node:fs');
const path = require('node:path');
const data = require('./completion-corpus.cjs');
const ROOT = path.resolve(__dirname, '../..');
const BENCH_SOURCES = ['reference-models.cjs', 'completion-corpus.cjs', 'completion-workspace.cjs', 'run-completion-campaign.cjs'];
const RUNTIME_SOURCES = ['agow/workspaceCycleService.js', 'agow/workspaceBroadcastService.js',
  'agow/cognitiveModeRuntimeService.js', 'predictiveTimescale/predictiveTimescaleService.js',
  'selfTwin/selfTwinService.js', 'selfTwin/selfTwinEdgeLearningService.js'];

function requireEqual(left, right, message) {
  if (data.hash(left) !== data.hash(right)) throw Error(message);
}

function verifySources(manifest) {
  const sources = manifest.model.sources;
  requireEqual(Object.keys(sources).sort(), [...BENCH_SOURCES, ...RUNTIME_SOURCES].sort(), 'Source coverage mismatch');
  for (const name of BENCH_SOURCES) requireEqual(sources[name], data.hash(fs.readFileSync(path.join(__dirname, name), 'utf8')), 'Benchmark source drift');
  for (const name of RUNTIME_SOURCES) requireEqual(sources[name], data.hash(fs.readFileSync(path.join(ROOT, 'backend/src/services', name), 'utf8')), 'Runtime source drift');
  requireEqual(manifest.dependencies.node, process.version, 'Node version drift');
  requireEqual(manifest.dependencies.platform, process.platform, 'Platform drift');
  requireEqual(manifest.dependencies.backendLockHash, data.hash(fs.readFileSync(path.join(ROOT, 'backend/package-lock.json'), 'utf8')), 'Dependency lock drift');
}

function summarize(results) {
  const summary = {};
  for (const result of results) {
    const previous = summary[result.condition] || { runs: 0, successes: 0, errors: 0, cost: 0 };
    previous.runs += 1;
    previous.successes += Number(result.outcome.success);
    previous.errors += result.outcome.errors;
    previous.cost += result.outcome.cost;
    summary[result.condition] = previous;
  }
  return summary;
}

function verifySummary(receipt) {
  const expected = summarize(receipt.results);
  requireEqual(Object.keys(expected).sort(), [...receipt.conditions].sort(), 'Condition coverage mismatch');
  for (const [condition, metrics] of Object.entries(expected)) {
    const actual = receipt.summary[condition];
    for (const key of ['runs', 'successes', 'errors', 'cost']) requireEqual(actual[key], metrics[key], 'Summary mismatch');
    if (Math.abs(actual.meanErrors - metrics.errors / metrics.runs) > 1e-12) throw Error('Mean error mismatch');
    if (Math.abs(actual.successRate - metrics.successes / metrics.runs) > 1e-12) throw Error('Success rate mismatch');
  }
  return expected;
}

function verifyResults(receipt, corpus) {
  requireEqual(receipt.corpusHash, data.hash(corpus.map(({ caseId, input }) => ({ caseId, input }))), 'Corpus hash mismatch');
  requireEqual(receipt.caseCount, corpus.length, 'Case count mismatch');
  const pairs = new Set();
  const ids = new Set(corpus.map(item => item.caseId));
  for (const result of receipt.results) {
    const key = result.caseId + ':' + result.condition;
    if (!ids.has(result.caseId) || !receipt.conditions.includes(result.condition) || pairs.has(key)) throw Error('Duplicate or foreign case');
    if (typeof result.outcome?.success !== 'boolean' || !Number.isFinite(result.outcome.errors)) throw Error('Invalid outcome');
    if (!Number.isFinite(result.outcome.cost) || result.outcome.cost < 0) throw Error('Invalid measured cost');
    pairs.add(key);
  }
  requireEqual(pairs.size, corpus.length * receipt.conditions.length, 'Missing paired result');
  return verifySummary(receipt);
}

function verify(folder) {
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
  const report = JSON.parse(fs.readFileSync(path.join(folder, 'report.json'), 'utf8'));
  requireEqual(report.manifest, manifest.manifest, 'Environment manifest mismatch');
  requireEqual(report.protocol, manifest.protocol, 'Protocol mismatch');
  requireEqual(report.runtimeNamespace, manifest.runtimeNamespace, 'Runtime namespace mismatch');
  requireEqual(data.hash(report.receipts), report.artifactHash, 'Receipt archive digest mismatch');
  verifySources(report.manifest);
  const replicas = report.receipts.filter(item => item.kind === 'agow_holdout_replication');
  requireEqual(replicas.map(item => item.seed).sort(), manifest.protocol.fixedSeeds.slice().sort(), 'Replication seeds mismatch');
  requireEqual(report.receipts.length, replicas.length + 2, 'Unexpected receipt coverage');
  const summaries = [];
  for (const receipt of report.receipts) {
    requireEqual(receipt.environmentHash, data.hash(report.manifest), 'Receipt environment mismatch');
    requireEqual(receipt.protocolHash, data.hash(receipt.protocol), 'Receipt protocol digest mismatch');
    const registered = manifest.corpora.find(item => item.seed === receipt.seed);
    if (registered) requireEqual(receipt.protocol, manifest.protocol, 'Registered protocol mismatch');
    const corpus = registered ? registered.cases : data.corpus('agow-mediation-v3', manifest.protocol.count).cases;
    if (registered) requireEqual(registered.hash, data.hash(corpus), 'Sealed corpus mismatch');
    summaries.push({ seed: receipt.seed, conditions: verifyResults(receipt, corpus) });
  }
  return { status: 'verified_local_archive', artifactHash: report.artifactHash, summaries,
    sourceCount: BENCH_SOURCES.length + RUNTIME_SOURCES.length, promotionAllowed: false,
    limitation: 'Local source and artifact verification. No independent laboratory replication or consciousness inference.' };
}

if (require.main === module) {
  try { console.log(JSON.stringify(verify(path.resolve(process.argv[2] || '.genos-agent-worlds/agow-completion-campaign-v3')), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { verify };
