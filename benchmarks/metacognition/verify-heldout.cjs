'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const corpus = require('./heldout-corpus.cjs');
const oracle = require('./heldout-oracle.cjs');
const { digest } = require('../../backend/src/services/biologicalIntegrity');
const validation = require('../../backend/src/services/morphogenesis/learning/outcomeEvidenceValidation');
const negative = require('../../backend/src/services/terminalOutcomeEvidence');
const ROOT = path.resolve(__dirname, '../..');
const SOURCES = ['benchmarks/metacognition/run-heldout.cjs', 'benchmarks/metacognition/heldout-corpus.cjs',
  'benchmarks/metacognition/heldout-oracle.cjs', 'benchmarks/metacognition/ollama-adapter.cjs',
  'backend/src/services/metacognitiveForecastService.js', 'backend/src/services/metacognitiveForecastStore.js',
  'backend/src/services/metacognitionBenchService.js'];

function same(actual, expected, message) {
  if (digest(actual) !== digest(expected)) throw Error(message);
}

function checkResolution(row, item) {
  const forecast = row.forecast;
  const event = row.resolution;
  const evidence = event.payload.qualityEvidence || event.payload.negativeOutcomeEvidence;
  same(row.oracle, oracle.evaluate({ problem: item, answer: row.oracle.observed }), 'Oracle disagreement');
  same(event.payload.executionRunId, item.caseId, 'Resolution run mismatch');
  for (const field of ['agentId', 'organizationId', 'projectId']) same(evidence[field], forecast[field], 'Scope mismatch');
  same(evidence.actionId, forecast.runId, 'Action mismatch');
  same(evidence.success, row.oracle.correct, 'Outcome mismatch');
  same(evidence.receipt.evidenceDigest, validation.evidenceDigest(evidence), 'Evidence digest mismatch');
  same(evidence.receipt.resultId, evidence.receiptId, 'Receipt binding mismatch');
  if (evidence.receipt.independent !== true) throw Error('Dependent oracle');
  const checkedAt = Date.parse(evidence.receipt.checkedAt);
  if (!Number.isFinite(checkedAt) || checkedAt < Date.parse(forecast.createdAt)) throw Error('Outcome predates forecast');
  same(event.eventType, row.oracle.correct ? 'AGENT_COMPLETED' : 'AGENT_FAILED', 'Terminal event mismatch');
  if (!row.oracle.correct) same(evidence.learningContext.terminalEventHash, negative.terminalEventHash(event), 'Negative event mismatch');
}

function checkRows(report, cases) {
  same(report.measurements.map(row => row.caseId), cases.map(item => item.caseId), 'Missing, reordered or duplicate cases');
  const resolved = [];
  for (const [index, row] of report.measurements.entries()) {
    const item = cases[index];
    same([row.domain, row.seed], [item.domain, item.seed], 'Case metadata mismatch');
    if (row.status === 'failed' && typeof row.reason === 'string') continue;
    if (row.status !== 'resolved') throw Error('Unknown case status');
    const forecast = row.forecast;
    same(forecast.runId, item.caseId, 'Forecast run mismatch');
    same(forecast.target, 'independently_verified_task_success', 'Forecast target mismatch');
    if (!Number.isFinite(forecast.probability) || forecast.probability < 0 || forecast.probability > 1) throw Error('Invalid probability');
    if (!(Date.parse(forecast.createdAt) >= Date.parse(report.manifest.sealedAt))) throw Error('Invalid forecast chronology');
    checkResolution(row, item);
    resolved.push(row);
  }
  return resolved;
}

function metrics(rows) {
  const mean = pick => rows.reduce((sum, row) => sum + pick(row), 0) / rows.length;
  const confidence = row => row.forecast.probability;
  const correct = row => Number(row.oracle.correct);
  const good = rows.filter(row => row.oracle.correct);
  const bad = rows.filter(row => !row.oracle.correct);
  let wins = 0;
  for (const high of good) for (const low of bad) wins += confidence(high) > confidence(low) ? 1 : Number(confidence(high) === confidence(low)) / 2;
  const bins = Array.from({ length: 5 }, (_, index) => rows.filter(row => Math.min(4, Math.floor(confidence(row) * 5)) === index));
  const ece = bins.reduce((sum, bin) => sum + Math.abs(bin.reduce((total, row) => total + confidence(row) - correct(row), 0)), 0) / rows.length;
  const round = value => Math.round(value * 1000) / 1000;
  return { meanConfidence: round(mean(confidence)), meanCorrectness: round(mean(correct)),
    brier: round(mean(row => (confidence(row) - correct(row)) ** 2)), ece: round(ece),
    overconfidence: round(mean(row => confidence(row) - correct(row))),
    type2auc: good.length && bad.length ? round(wins / (good.length * bad.length)) : null };
}

function checkMetrics(report, rows) {
  same(report.coverage, rows.length / report.measurements.length, 'Coverage mismatch');
  same(report.calibration.trials, rows.length, 'Trial count mismatch');
  if (rows.length >= 10) {
    same(report.calibration.status, 'measured', 'Calibration status mismatch');
    for (const [key, value] of Object.entries(metrics(rows))) same(report.calibration[key], value, 'Calibration metric mismatch');
  } else same(report.calibration.status, 'insufficient_data', 'Insufficient data scored');
  for (const domain of corpus.DOMAINS) {
    const selected = rows.filter(row => row.domain === domain);
    same(report.groups[domain].resolved, selected.length, 'Domain coverage mismatch');
    same(report.groups[domain].successes, selected.filter(row => row.oracle.correct).length, 'Domain successes mismatch');
    const brier = selected.length ? selected.reduce((sum, row) => sum + (row.forecast.probability - Number(row.oracle.correct)) ** 2, 0) / selected.length : null;
    same(report.groups[domain].brier, brier, 'Domain metric mismatch');
  }
}

function verifyArchive(archive, expectedHash) {
  const report = archive.report;
  same(digest(report), archive.hash, 'Archive hash mismatch');
  if (expectedHash) same(archive.hash, expectedHash, 'Pinned archive hash mismatch');
  if (!crypto.verify(null, Buffer.from(JSON.stringify(report)), report.manifest.publicKey, Buffer.from(archive.signature, 'base64'))) throw Error('Archive signature mismatch');
  const protocol = report.manifest.protocol;
  same(protocol.seeds, corpus.SEEDS, 'Reserved seeds mismatch');
  same(protocol.developmentSeed, corpus.DEVELOPMENT_SEED, 'Development seed mismatch');
  same(protocol.domains, corpus.DOMAINS, 'Domain protocol mismatch');
  same(protocol.perDomain, 2, 'Protocol size mismatch');
  const cases = corpus.SEEDS.flatMap(seed => corpus.corpus(seed, protocol.perDomain));
  same(report.manifest.corpusHash, corpus.hash(cases), 'Corpus digest mismatch');
  const rows = checkRows(report, cases);
  checkMetrics(report, rows);
  const accounting = report.accounting;
  if (!(accounting.calls <= protocol.maxCalls && accounting.outputTokens <= protocol.maxOutputTokens
    && accounting.elapsedMs <= protocol.maxDurationMs)) throw Error('Budget exceeded');
  same(report.status, rows.length === cases.length ? 'measured_local_holdout' : 'incomplete', 'Completion status mismatch');
  same(report.officialBenchmarks, { SAD: 'not_run', MIRROR: 'not_run' }, 'Official benchmark overclaim');
  same(report.promotionAllowed, false, 'Promotion overclaim');
  return { status: 'verified_local_archive', hash: archive.hash, trials: rows.length, coverage: report.coverage,
    promotionAllowed: false, limitation: 'Public signature verifies archive integrity; included key is not independent attestation. Ephemeral runtime HMAC receipts cannot be reauthenticated offline.' };
}

function verify(folder, expectedHash) {
  const archive = JSON.parse(fs.readFileSync(path.join(folder, 'report.json'), 'utf8'));
  same(archive.report.manifest, JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8')), 'Sealed manifest mismatch');
  same(Object.keys(archive.report.manifest.sources).sort(), [...SOURCES].sort(), 'Source coverage mismatch');
  const historicalSources = verifySources(archive.report.manifest);
  return { ...verifyArchive(archive, expectedHash), historicalSources };
}

function verifySources(manifest) {
  const historicalSources = [];
  for (const file of SOURCES) {
    if (manifest.sources[file] === digest(fs.readFileSync(path.join(ROOT, file), 'utf8'))) continue;
    if (!/^[a-f0-9]{40}$/.test(manifest.head)) throw Error('Invalid source revision');
    const historical = execFileSync('git', ['show', manifest.head + ':' + file], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
    same(manifest.sources[file], digest(historical), 'Source drift');
    historicalSources.push({ file, revision: manifest.head });
  }
  return historicalSources;
}

if (require.main === module) {
  try { console.log(JSON.stringify(verify(path.resolve(process.argv[2]), process.argv[3]), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { verify, verifyArchive, metrics };
