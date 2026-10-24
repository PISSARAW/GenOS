'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const crypto = require('node:crypto');
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= crypto.randomBytes(32).toString('hex');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { open } = require('../../backend/node_modules/sqlite');
const sqlite3 = require('../../backend/node_modules/sqlite3');
const forecasts = require('../../backend/src/services/metacognitiveForecastService');
const bench = require('../../backend/src/services/metacognitionBenchService');
const validation = require('../../backend/src/services/morphogenesis/learning/outcomeEvidenceValidation');
const negative = require('../../backend/src/services/terminalOutcomeEvidence');
const receipts = require('../../backend/src/services/epistemicVerifierReceiptService');
const trust = require('../../backend/src/services/verifierTrustRegistry');
const { digest } = require('../../backend/src/services/biologicalIntegrity');
const corpus = require('./heldout-corpus.cjs');
const ollama = require('./ollama-adapter.cjs');
const ROOT = path.resolve(__dirname, '../..');
const MODEL = process.argv[2] || 'qwen2.5:0.5b';
const OUTPUT = path.join(ROOT, '.genos-agent-worlds', 'metacognition-heldout-' + crypto.randomUUID());
const PROTOCOL = Object.freeze({ version: 1, seeds: corpus.SEEDS, developmentSeed: corpus.DEVELOPMENT_SEED,
  domains: corpus.DOMAINS, perDomain: 2, maxCalls: 36, maxOutputTokens: 36 * ollama.MAX_TOKENS,
  maxDurationMs: 300000, maxRequestMs: 30000, metric: 'Brier against independent exact binary oracle',
  order: ['forecast', 'persist immutable prior', 'answer', 'separate process oracle', 'signed resolution'],
  sourceClass: 'new_local_engineering_holdout', promotionAllowed: false });

async function setup(db) {
  await db.exec(`CREATE TABLE adaptive_state(scope TEXT,key TEXT,payload_json TEXT,version INTEGER,updated_at TEXT,PRIMARY KEY(scope,key));
    CREATE TABLE adaptive_state_events(scope TEXT,key TEXT,event_type TEXT,event_payload TEXT,created_at TEXT);
    CREATE TABLE workspaces(id TEXT PRIMARY KEY,organization_id TEXT,project_id TEXT);
    CREATE TABLE agents(id TEXT PRIMARY KEY,workspace_id TEXT);
    CREATE TABLE strategy_execution_runs(id TEXT PRIMARY KEY,agent_id TEXT,status TEXT);
    INSERT INTO workspaces VALUES('holdout','research','metacognition');
    INSERT INTO agents VALUES('holdout-agent','holdout');`);
}

function sourceHashes() {
  const files = ['benchmarks/metacognition/run-heldout.cjs', 'benchmarks/metacognition/heldout-corpus.cjs',
    'benchmarks/metacognition/heldout-oracle.cjs', 'benchmarks/metacognition/ollama-adapter.cjs',
    'backend/src/services/metacognitiveForecastService.js', 'backend/src/services/metacognitiveForecastStore.js',
    'backend/src/services/metacognitionBenchService.js'];
  return Object.fromEntries(files.map(name => [name, digest(fs.readFileSync(path.join(ROOT, name), 'utf8'))]));
}

function oracle(item, answer) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'heldout-oracle.cjs')], {
    input: JSON.stringify({ problem: item, answer }), encoding: 'utf8', timeout: 5000, windowsHide: true });
  if (result.status !== 0) throw Error('Independent oracle process failed');
  return JSON.parse(result.stdout);
}

function outcomeEvent(runId, observed) {
  const event = { eventType: observed.correct ? 'AGENT_COMPLETED' : 'AGENT_FAILED', payload: { executionRunId: runId } };
  const evidence = { status: 'VERIFIED', kind: 'deterministic_verifier', receiptId: 'heldout:' + runId,
    actionId: runId, agentId: 'holdout-agent', organizationId: 'research', projectId: 'metacognition',
    success: observed.correct, value: Number(observed.correct) };
  if (!observed.correct) evidence.learningContext = { schema: negative.NEGATIVE_OUTCOME_SCHEMA,
    eventType: event.eventType, terminalEventHash: negative.terminalEventHash(event) };
  evidence.receipt = receipts.issueReceipt({ resultId: evidence.receiptId,
    evidenceDigest: validation.evidenceDigest(evidence), verifierDigest: trust.ensureVerifier('testResult').digest,
    independent: true, independenceDescriptor: { actorId: 'heldout-exact-oracle-process', workspaceId: OUTPUT } });
  return { ...event, payload: { ...event.payload,
    [observed.correct ? 'qualityEvidence' : 'negativeOutcomeEvidence']: evidence } };
}

async function inference(item, state, instruction) {
  const remaining = PROTOCOL.maxDurationMs - (Date.now() - state.started);
  if (state.calls >= PROTOCOL.maxCalls || remaining <= 0 || state.tokens >= PROTOCOL.maxOutputTokens) throw Error('HELDOUT_BUDGET_EXHAUSTED');
  state.calls += 1;
  const result = await ollama.request({ model: MODEL, prompt: item.prompt, instruction,
    seed: parseInt(corpus.hash(item.caseId).slice(0, 7), 16), timeoutMs: Math.min(remaining, PROTOCOL.maxRequestMs) });
  state.tokens += result.tokens;
  state.inputTokens += result.inputTokens;
  return result.value;
}

async function runCase(db, item, state) {
  const runId = item.caseId;
  await db.run("INSERT INTO strategy_execution_runs VALUES(?,'holdout-agent','planned')", runId);
  const prior = await inference(item, state, 'Estimate the probability that you will answer this task correctly. Return only JSON {"probability": a number between 0 and 1}. Do not give the answer.');
  const saved = await forecasts.capture(db, { runId, agentId: 'holdout-agent', probability: prior.probability });
  await db.run("UPDATE strategy_execution_runs SET status='running' WHERE id=?", runId);
  const response = await inference(item, state, 'Solve the task. Return only JSON {"answer": a number}.');
  const measured = oracle(item, response.answer);
  await db.run('UPDATE strategy_execution_runs SET status=? WHERE id=?', measured.correct ? 'completed' : 'failed', runId);
  const event = outcomeEvent(runId, measured);
  const resolved = await forecasts.observe(db, { run: { id: runId }, event });
  if (resolved.status !== 'resolved') throw Error('Forecast resolution refused');
  return { caseId: runId, domain: item.domain, seed: item.seed, status: 'resolved',
    forecast: saved.forecast, oracle: measured, resolution: event, answerHash: digest(response) };
}

function groups(measurements) {
  return Object.fromEntries(corpus.DOMAINS.map(domain => {
    const rows = measurements.filter(item => item.domain === domain && item.status === 'resolved');
    const brier = rows.length ? rows.reduce((sum, item) => sum + (item.forecast.probability - Number(item.oracle.correct)) ** 2, 0) / rows.length : null;
    return [domain, { resolved: rows.length, successes: rows.filter(item => item.oracle.correct).length, brier }];
  }));
}

async function main() {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const keys = crypto.generateKeyPairSync('ed25519');
  const cases = corpus.SEEDS.flatMap(seed => corpus.corpus(seed, PROTOCOL.perDomain));
  const manifest = { schema: 'genos.metacognition-heldout/v1', protocol: PROTOCOL, corpusHash: corpus.hash(cases),
    sources: sourceHashes(), head: require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }), sealedAt: new Date().toISOString() };
  try { manifest.model = await ollama.describe(MODEL); }
  catch (error) {
    fs.writeFileSync(path.join(OUTPUT, 'not-run.json'), JSON.stringify({ status: 'not_run', reason: error.message, manifest, promotionAllowed: false }, null, 2));
    console.log(JSON.stringify({ output: OUTPUT, status: 'not_run', reason: error.message }));
    process.exitCode = 2;
    return;
  }
  fs.writeFileSync(path.join(OUTPUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const db = await open({ filename: path.join(OUTPUT, 'measurements.sqlite'), driver: sqlite3.Database });
  const state = { started: Date.now(), calls: 0, tokens: 0, inputTokens: 0 };
  const measurements = [];
  try {
    await setup(db);
    for (const item of cases) {
      try { measurements.push(await runCase(db, item, state)); }
      catch (error) { measurements.push({ caseId: item.caseId, domain: item.domain, seed: item.seed, status: 'failed', reason: error.message }); }
      fs.writeFileSync(path.join(OUTPUT, 'progress.json'), JSON.stringify({ manifestHash: digest(manifest), measurements, state }, null, 2));
      console.log(JSON.stringify({ completed: measurements.length, total: cases.length, calls: state.calls, outputTokens: state.tokens }));
    }
    const calibration = await bench.runBench(db, 'holdout-agent', {});
    if (digest(sourceHashes()) !== digest(manifest.sources)) throw Error('Benchmark sources changed after preregistration');
    const currentModel = await ollama.describe(MODEL);
    if (currentModel.digest !== manifest.model.digest) throw Error('Model digest changed during evaluation');
    const report = { manifest, measurements, groups: groups(measurements), calibration,
      accounting: { calls: state.calls, outputTokens: state.tokens, inputTokens: state.inputTokens, elapsedMs: Date.now() - state.started },
      coverage: measurements.filter(item => item.status === 'resolved').length / cases.length,
      status: measurements.every(item => item.status === 'resolved') ? 'measured_local_holdout' : 'incomplete',
      officialBenchmarks: { SAD: 'not_run', MIRROR: 'not_run' }, promotionAllowed: false,
      limitation: 'New local generated tasks and one host. Not official SAD or MIRROR, not independent laboratory replication. SQLite receipt key is ephemeral; archive signature is verifiable with the included public key.' };
    const payload = Buffer.from(JSON.stringify(report));
    const archive = { report, hash: digest(report), signature: crypto.sign(null, payload, keys.privateKey).toString('base64') };
    fs.writeFileSync(path.join(OUTPUT, 'report.json'), JSON.stringify(archive, null, 2));
    console.log(JSON.stringify({ output: OUTPUT, status: report.status, coverage: report.coverage, calibration, groups: report.groups, hash: archive.hash }));
  } finally { await db.close(); }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { groups, sourceHashes };
