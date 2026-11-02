'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync, execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const PROTOCOL_PATH = path.join(__dirname, 'protocol.json');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function sourceFiles() {
  const identity = 'backend/src/services/identity';
  return fs.readdirSync(path.join(ROOT, identity)).map(name => `${identity}/${name}`)
    .concat(fs.readdirSync(__dirname).filter(name => /\.(cjs|json)$/.test(name))
      .map(name => `benchmarks/identity-continuity/${name}`))
    .concat(['backend/src/services/familyHistoryService.js', 'backend/src/db/index.js',
      'backend/src/db/migrations/migrateAgentIdentity.js',
      'backend/src/services/autobiographicalMemory/episodeStore.js', 'backend/package-lock.json']);
}

function sourceHashes() {
  return Object.fromEntries(sourceFiles().sort().map(name => [name, digest(fs.readFileSync(path.join(ROOT, name)))]));
}

function manifest(protocolBytes) {
  return { protocol: JSON.parse(protocolBytes), protocolHash: digest(protocolBytes),
    revision: git(['rev-parse', 'HEAD']), status: git(['status', '--short']),
    node: process.version, platform: process.platform, arch: process.arch,
    startedAt: new Date().toISOString(), sourceHashes: sourceHashes(),
    promotionAuthorized: false };
}

function invoke(directory, input) {
  const label = input.mode === 'train' ? `train-${input.chunk}` : `eval-${input.window}`;
  const requestPath = path.join(directory, `${label}.request.json`);
  const output = path.join(directory, `${label}.json`);
  const request = { ...input, output, database: path.join(directory, 'runtime.sqlite') };
  fs.writeFileSync(requestPath, JSON.stringify(request));
  const child = spawnSync(process.execPath, [path.join(__dirname, 'worker.cjs'), requestPath],
    { cwd: ROOT, encoding: 'utf8', timeout: 180000, windowsHide: true, maxBuffer: 1024 * 1024 });
  fs.writeFileSync(path.join(directory, `${label}.log`), `${child.stdout || ''}${child.stderr || ''}`);
  assert.ifError(child.error);
  assert.equal(child.status, 0, `${label} failed: ${child.stderr}`);
  return JSON.parse(fs.readFileSync(output, 'utf8'));
}

function checkWindow(window, protocol) {
  const arms = window.evaluation.arms;
  assert.equal(window.evaluation.feedbackWrites, 0);
  assert.equal(arms.learned.tasks, protocol.evaluationTasks);
  assert.ok(arms.learned.successRate - arms.disabled.successRate >= protocol.minimumAccuracyGain);
  assert.ok(arms.learned.successRate - arms.permuted.successRate >= protocol.minimumAccuracyGain);
  assert.ok(arms.learned.brier <= protocol.maximumBrier);
  assert.equal(arms.learned.successRate, arms.alwaysAudit.successRate);
  assert.ok(arms.learned.cost < arms.alwaysAudit.cost);
}

function summarize(seed, stages) {
  const training = stages.filter(stage => stage.mode === 'train');
  const evaluations = stages.filter(stage => stage.mode === 'eval');
  return { seed, transformations: training.reduce((n, s) => n + s.transformations, 0),
    cycles: training.reduce((n, s) => n + s.cycles, 0),
    recognitions: training.reduce((n, s) => n + s.recognitions, 0),
    adversarialRejections: training.reduce((n, s) => n + s.rejected + s.staleSessionRejected + s.inheritance.crossScopeRejected, 0),
    inheritedEpisodes: training.reduce((n, s) => n + s.inheritance.inherited, 0),
    freshProcesses: stages.length, identityAnchorRestores: training.length,
    finalVerification: evaluations.at(-1).verification,
    windows: evaluations.map(stage => stage.evaluation) };
}

function runSeed(output, context) {
  const { seed, protocol } = context;
  const directory = path.join(output, `seed-${seed}`);
  fs.mkdirSync(directory);
  const stages = [];
  for (let chunk = 0; chunk < protocol.cycles / protocol.chunkSize; chunk++) {
    stages.push(invoke(directory, { seed, protocol, chunk, initialize: chunk === 0, mode: 'train' }));
    process.stdout.write(`seed=${seed} cycles=${(chunk + 1) * protocol.chunkSize}/${protocol.cycles}\n`);
  }
  for (let window = 0; window < protocol.evaluationWindows; window++) {
    const stage = invoke(directory, { seed, protocol, window, mode: 'eval' });
    checkWindow(stage, protocol);
    stages.push(stage);
  }
  assert.equal(new Set(stages.map(stage => stage.processNonce)).size, stages.length);
  assert.equal(new Set(stages.map(stage => stage.incarnationId)).size, stages.length);
  const summary = summarize(seed, stages);
  assert.equal(summary.transformations, protocol.cycles);
  assert.equal(summary.cycles, protocol.cycles);
  return summary;
}

function run(output) {
  fs.mkdirSync(output, { recursive: true });
  const sealed = manifest(fs.readFileSync(PROTOCOL_PATH, 'utf8'));
  const manifestPath = path.join(output, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(sealed, null, 2), { flag: 'wx' });
  try {
    const runs = sealed.protocol.seeds.map(seed => runSeed(output, { seed, protocol: sealed.protocol }));
    assert.deepEqual(sourceHashes(), sealed.sourceHashes, 'source changed during campaign');
    assert.equal(git(['rev-parse', 'HEAD']), sealed.revision, 'revision changed during campaign');
    const report = { status: 'passed', scope: sealed.protocol.scope, protocolHash: sealed.protocolHash,
      manifestHash: digest(fs.readFileSync(manifestPath)), completedAt: new Date().toISOString(),
      promotionAuthorized: false, runs };
    fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(report, null, 2));
    return report;
  } catch (error) {
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ status: 'failed',
      error: error.stack, at: new Date().toISOString(), promotionAuthorized: false }, null, 2));
    throw error;
  }
}

if (require.main === module) {
  const output = path.resolve(process.argv[2] || path.join(__dirname, 'results', new Date().toISOString().replace(/[:.]/g, '-')));
  try { run(output); console.log(`PASS ${path.join(output, 'summary.json')}`); }
  catch (error) { console.error(error); process.exitCode = 1; }
}

module.exports = { run, checkWindow, sourceHashes };
