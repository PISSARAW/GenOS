'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const protocol = require('./config.cjs');
const corpus = require('./corpus.cjs');
const evidence = require('./evidence.cjs');
const inference = require('./inference.cjs');
const scoring = require('./scoring.cjs');
const engine = require('./engine.cjs');

function invoke(input, state) {
  const label = input.mode === 'train' ? `train-${input.chunk}` : `eval-${input.window}`;
  const requestPath = path.join(input.directory, `${label}.request.json`);
  const reportPath = path.join(input.directory, `${label}.report.json`);
  const request = { ...input, reportPath, deadline: state.deadline, callLimit: protocol.maximumCalls - state.calls };
  evidence.write(input.directory, `${label}.request.json`, request);
  const result = spawnSync(process.execPath, [path.join(__dirname, 'worker.cjs'), requestPath], {
    cwd: __dirname, windowsHide: true, stdio: 'inherit', timeout: Math.max(1000, state.deadline - Date.now()) });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${input.directory}/${label} failed`);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  state.calls += report.calls;
}

function summary(directory) {
  const events = evidence.journal(directory);
  const responses = events.filter(row => row.type === 'response-committed').map(row => row.response);
  assert.equal(events.filter(row => row.type === 'train-result').length, protocol.cyclesPerLineage);
  assert.equal(events.filter(row => row.type === 'clone-result').length, Math.floor(protocol.cyclesPerLineage / protocol.descendantProbeEvery));
  const evaluationCount = Object.values(protocol.tasksPerWindow).reduce((sum, n) => sum + n, 0)
    * protocol.evaluationWindows * protocol.arms.length;
  assert.equal(events.filter(row => row.type === 'eval-result').length, evaluationCount);
  assert.equal(responses.length, 2 * protocol.cyclesPerLineage + Math.floor(protocol.cyclesPerLineage / protocol.descendantProbeEvery) + evaluationCount);
  assert.equal(events.filter(row => row.type === 'model-server-restarted').length, protocol.evaluationWindows);
  const identity = scoring.identitySummary(events);
  const learning = scoring.learningSummary(events);
  return { identity, learning, calls: responses.length,
    invalidOrTransportFailures: responses.filter(row => row.error || !row.value).length,
    inputTokens: responses.reduce((sum, row) => sum + (row.usage?.prompt_tokens || 0), 0),
    outputTokens: responses.reduce((sum, row) => sum + (row.usage?.completion_tokens || 0), 0),
    freshProcesses: events.filter(row => row.type === 'process-completed').length,
    retainedWindows: events.filter(row => row.type === 'retention-check').length,
    modelServerRestarts: events.filter(row => row.type === 'model-server-restarted').length,
    trainedCycles: events.filter(row => row.type === 'train-result').length,
    passed: identity.passed && learning.passed };
}

async function prepare(output) {
  if (fs.existsSync(output)) throw Error('OUTPUT_ALREADY_EXISTS');
  assert.equal(await evidence.fileHash(protocol.modelBlob), protocol.modelSha256, 'MODEL_BLOB_DIGEST_MISMATCH');
  await engine.restart();
  const ready = await inference.ready();
  fs.mkdirSync(output, { recursive: true });
  const seeds = Array.from({ length: protocol.lineages }, () => crypto.randomBytes(16).toString('hex'));
  const manifest = { protocol, protocolHash: corpus.hash(fs.readFileSync(path.join(__dirname, 'protocol.json'), 'utf8')),
    seeds, preflight: ready, provenance: evidence.provenance(), startedAt: new Date().toISOString(),
    engine: JSON.parse(fs.readFileSync('D:/GenOS-runs/identity-llm-engine/engine.json', 'utf8')),
    promotionAuthorized: false };
  evidence.write(output, 'manifest.json', manifest);
  console.log(`SEALED_MANIFEST ${corpus.hash(manifest)}`);
  return manifest;
}

async function runLineage(output, input, state) {
  const directory = path.join(output, `lineage-${input.lineage}`);
  fs.mkdirSync(directory);
  const w = corpus.world(input.seed);
  evidence.write(directory, 'private-world.json', w);
  const worldPath = path.join(directory, 'private-world.json');
  const common = { lineage: input.lineage, directory, worldPath };
  for (let chunk = 0; chunk < protocol.cyclesPerLineage / protocol.chunkSize; chunk++) {
    invoke({ ...common, mode: 'train', chunk, initialize: chunk === 0 }, state);
  }
  for (let window = 0; window < protocol.evaluationWindows; window++) {
    const server = await engine.restart();
    inference.log(directory, { type: 'model-server-restarted', window, server });
    invoke({ ...common, mode: 'eval', window }, state);
  }
  const report = summary(directory);
  evidence.write(directory, 'summary.json', report);
  console.log(`LINEAGE_RESULT ${input.lineage} ${JSON.stringify({ passed: report.passed, identity: report.identity.passed, learning: report.learning.passed })}`);
  return report;
}

async function main(output) {
  const manifest = await prepare(output);
  const state = { calls: 0, deadline: Date.now() + protocol.maximumDurationMs };
  try {
    const results = [];
    for (const [lineage, seed] of manifest.seeds.entries()) results.push(await runLineage(output, { seed, lineage }, state));
    assert.deepEqual(evidence.sourceHashes(), manifest.provenance.sources, 'SOURCE_CHANGED_DURING_CAMPAIGN');
    assert.equal(await evidence.fileHash(protocol.modelBlob), protocol.modelSha256);
    const passed = results.every(row => row.passed);
    const report = { status: passed ? 'bounded_support' : 'hypotheses_not_supported',
      completedAt: new Date().toISOString(), manifestHash: corpus.hash(manifest), results,
      actualCalls: state.calls, totalElapsedMs: protocol.maximumDurationMs - (state.deadline - Date.now()),
      monetaryCostUsd: null, promotionAuthorized: false };
    evidence.write(output, 'summary.json', report);
    console.log(`CAMPAIGN_COMPLETED ${path.join(output, 'summary.json')} status=${report.status}`);
    return report;
  } catch (error) {
    evidence.write(output, 'failure.json', { status: 'inconclusive_execution_failure', error: error.stack,
      partialCalls: state.calls, at: new Date().toISOString(), promotionAuthorized: false });
    throw error;
  }
}

if (require.main === module) {
  const output = path.resolve(process.argv[2] || path.join('D:/GenOS-runs/identity-llm/campaigns', new Date().toISOString().replace(/[:.]/g, '-')));
  main(output).catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { main, summary };
