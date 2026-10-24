'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadRunner } = require('./runner-registry.cjs');
const { assessReadiness } = require('./campaign-proof-readiness.cjs');
const { validateReport } = require('./validate-report.cjs');

const ROOT = path.resolve(__dirname, '../../../..');
const MANIFEST_PATH = path.join(__dirname, 'manifest.json');
const REPORT_ROOT = path.join(__dirname, 'reports');

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--all') parsed.all = true;
    else if (args[index].startsWith('--') && args[index + 1]) parsed[args[index].slice(2)] = args[++index];
    else throw new Error(`Unexpected argument: ${args[index]}`);
  }
  return parsed;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function sourceCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Unable to resolve source commit: ${result.stderr}`);
  return result.stdout.trim();
}

function reportDirectory() {
  return REPORT_ROOT;
}

function reportPath(input) {
  return path.join(reportDirectory(), `${input.scenario}-${input.seed}-${input.arm}-attempt-${input.attempt}.json`);
}

function commonHashes(comparison) {
  if (!comparison) return null;
  if (['eventsHash', 'budgetHash', 'permissionsHash'].every((field) => /^[a-f0-9]{64}$/i.test(comparison[field] || ''))) {
    return { eventsHash: comparison.eventsHash.toLowerCase(), budgetHash: comparison.budgetHash.toLowerCase(),
      permissionsHash: comparison.permissionsHash.toLowerCase() };
  }
  if (!Object.hasOwn(comparison, 'events') || !Object.hasOwn(comparison, 'budget')
    || !Object.hasOwn(comparison, 'permissions')) return null;
  return {
    eventsHash: digest(comparison.events),
    budgetHash: digest(comparison.budget),
    permissionsHash: digest(comparison.permissions),
  };
}

function statusFor(outcome) {
  return ['pass', 'fail', 'inconclusive'].includes(outcome && outcome.status) ? outcome.status : 'inconclusive';
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function oracleValue(outcome, status) {
  const oracle = objectValue(outcome.oracle);
  return { ...oracle, recalculable: status === 'pass' && oracle.recalculable === true };
}

function composeReport(input) {
  const { run, outcome, hashes, source, startedAt, startedMs, evidenceRefs } = input;
  const status = statusFor(outcome);
  return {
    campaignId: 'socialworld-v2', scenario: run.scenario, arm: run.arm, seed: run.seed,
    attempt: run.attempt, sourceCommit: source, runtimeVersion: '3',
    model: typeof (outcome && outcome.model) === 'string' ? outcome.model : null,
    configHash: digest({ manifestVersion: 2, scenario: run.scenario, seed: run.seed }),
    status, startedAt, durationMs: Date.now() - startedMs,
    inputs: { ...objectValue(outcome.inputs), comparison: hashes },
    observed: objectValue(outcome.observed), oracle: oracleValue(outcome, status),
    evidenceRefs,
    violations: Array.isArray(outcome.violations) ? outcome.violations : [],
    limitations: Array.isArray(outcome.limitations) ? outcome.limitations : [],
  };
}

function writeUnique(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

async function runOne(input) {
  const module = loadRunner(input.scenario);
  const evidenceFilename = reportPath(input).replace(/\.json$/, '.evidence.json');
  const evidenceRef = path.basename(evidenceFilename);
  const source = input.sourceCommit || sourceCommit();
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  let result;
  try {
    result = await invokeRunner({ module, input, source });
  } catch (error) {
    result = failedRun(error);
  }
  const outcome = annotateComparison(result.outcome, result.hashes);
  const evidence = { ...objectValue(result.evidence), scenario: input.scenario, arm: input.arm,
    seed: input.seed, comparisonHashes: result.hashes, startedAt, sourceCommit: source };
  writeUnique(evidenceFilename, evidence);
  const priorEvidenceRefs = Array.isArray(outcome.evidenceRefs) ? outcome.evidenceRefs : [];
  const report = composeReport({ run: input, outcome, hashes: result.hashes, source, startedAt, startedMs,
    evidenceRefs: [...new Set([...priorEvidenceRefs, evidenceRef])] });
  const filename = reportPath(input);
  writeUnique(filename, report);
  const errors = validateReport(report, filename, ROOT);
  if (errors.length) throw new Error(`generated report failed validation: ${errors.join('; ')}`);
  return { report: filename, status: report.status };
}

async function invokeRunner(input) {
  const { module, input: run, source } = input;
  ensureRunnerRegistered(module, run);
  const execution = await module.runScenario({ ...run, outputDirectory: reportDirectory(), sourceCommit: source });
  return normalizeExecution(execution);
}

function ensureRunnerRegistered(module, run) {
  const registered = module.REGISTERED_ARMS || module.SUPPORTED_ARMS || [];
  if (!registered.includes(run.arm) || typeof module.runScenario !== 'function') {
    throw new Error(`runner does not declare executable entry for ${run.scenario}/${run.arm}`);
  }
}

function normalizeExecution(execution) {
  const outcome = execution && execution.report ? execution.report : execution;
  if (!outcome || typeof outcome !== 'object') throw new Error('runner returned no report object');
  const hashes = commonHashes(execution && execution.comparison || outcome.inputs?.comparison);
  return { outcome, hashes, evidence: execution && execution.evidence };
}

function failedRun(error) {
  return { outcome: { status: 'inconclusive', oracle: { recalculable: false }, violations: [],
    limitations: [`Runner produced no complete proof: ${error.message}`] }, hashes: null, evidence: {} };
}

function annotateComparison(outcome, hashes) {
  if (hashes) return outcome;
  return { ...outcome, status: 'inconclusive', oracle: { recalculable: false },
    limitations: [...(Array.isArray(outcome.limitations) ? outcome.limitations : []),
      'No comparable event, budget and permissions hashes were supplied.'] };
}

function expandRuns(args, manifest) {
  return args.all ? allRuns(manifest) : [singleRun(args, manifest)];
}

function singleRun(args, manifest) {
  const run = { scenario: args.scenario, seed: args.seed, arm: args.arm, attempt: Number(args.attempt || 1) };
  if (!run.scenario || !run.seed || !run.arm) throw new Error('Use --scenario, --seed and --arm, or --all.');
  if (!Number.isSafeInteger(run.attempt) || run.attempt < 1) throw new Error('attempt must be a positive integer');
  if (!manifest.scenarios.some((scenario) => scenario.id === run.scenario)) throw new Error(`Unknown scenario: ${run.scenario}`);
  if (!manifest.seeds.includes(run.seed)) throw new Error(`Unknown seed: ${run.seed}`);
  if (!manifest.comparisonArms[run.scenario].includes(run.arm)) throw new Error(`Unknown arm ${run.arm} for ${run.scenario}`);
  return [run];
}

function allRuns(manifest) {
  return manifest.scenarios.flatMap((scenario) => manifest.seeds.flatMap((seed) =>
    manifest.comparisonArms[scenario.id].map((arm) => ({ scenario: scenario.id, seed, arm, attempt: 1 }))));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  if (args.all) {
    const readiness = assessReadiness(manifest, ROOT);
    if (!readiness.canLaunch) throw new Error(`Full campaign launch blocked: ${readiness.reasons.join('; ')}`);
  }
  const runs = expandRuns(args, manifest);
  const results = [];
  for (const run of runs) results.push(await runOne(run));
  process.stdout.write(`${JSON.stringify({ total: results.length, results }, null, 2)}\n`);
  if (results.some((result) => result.status === 'fail')) process.exitCode = 1;
  else if (results.some((result) => result.status === 'inconclusive')) process.exitCode = 2;
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
});

module.exports = { commonHashes, expandRuns, reportPath, runOne };
