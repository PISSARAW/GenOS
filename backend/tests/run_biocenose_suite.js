'use strict';

const fs = require('node:fs');
const path = require('node:path');
const processRunner = require('./helpers/suiteProcessRunner.cjs');

const DEFAULT_SUITE_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_TEST_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_PARENT_GRACE_MS = 2000;

function discoverFiles(directory = __dirname) {
  return fs.readdirSync(directory)
    .filter((name) => /^test_biocenose_.*\.js$/.test(name)).sort();
}

function requestedTests(args) {
  return args.filter((item) => item.startsWith('--test='))
    .flatMap((item) => item.slice('--test='.length).split(','))
    .map((item) => item.trim()).filter(Boolean);
}

function selectedFiles(args, catalog) {
  const requested = requestedTests(args);
  if (!requested.length) return catalog;
  const selected = catalog.filter((file) => requested.includes(file));
  const missing = requested.filter((file) => !catalog.includes(file));
  if (missing.length) throw new Error(`Unknown Biocenose test: ${missing.join(', ')}`);
  return selected;
}

function parentDeadline(env, graceMs) {
  if (env.GENOS_PARENT_DEADLINE_EPOCH_MS === undefined) return Infinity;
  const configured = processRunner.positiveMilliseconds(
    env.GENOS_PARENT_DEADLINE_EPOCH_MS, Infinity, 'GENOS_PARENT_DEADLINE_EPOCH_MS');
  return configured - graceMs;
}

function createPolicy(env, now) {
  const suiteTimeoutMs = processRunner.positiveMilliseconds(
    env.GENOS_BIOCENOSE_SUITE_TIMEOUT_MS, DEFAULT_SUITE_TIMEOUT_MS,
    'GENOS_BIOCENOSE_SUITE_TIMEOUT_MS');
  const testTimeoutMs = processRunner.positiveMilliseconds(
    env.GENOS_BIOCENOSE_TEST_TIMEOUT_MS, DEFAULT_TEST_TIMEOUT_MS,
    'GENOS_BIOCENOSE_TEST_TIMEOUT_MS');
  const graceMs = processRunner.positiveMilliseconds(
    env.GENOS_RUNNER_GRACE_MS, DEFAULT_PARENT_GRACE_MS, 'GENOS_RUNNER_GRACE_MS');
  return { testTimeoutMs, deadlineMs: Math.min(now + suiteTimeoutMs, parentDeadline(env, graceMs)) };
}

function resultCounts(outcomes) {
  return {
    passed: outcomes.filter((item) => item.status === 'PASS').length,
    failed: outcomes.filter((item) => item.status === 'FAIL').length,
    timedOut: outcomes.filter((item) => item.status === 'TIMEOUT').length
  };
}

function summaryLine(total, counts, durationMs) {
  return `Biocenose summary: total=${total} passed=${counts.passed} failed=${counts.failed} ` +
    `timedOut=${counts.timedOut} durationMs=${durationMs}`;
}

function executeFile(file, context) {
  const remainingMs = Math.max(0, context.policy.deadlineMs - context.now());
  context.stdout.write(`[START] ${file} remainingMs=${remainingMs}\n`);
  const outcome = processRunner.runProcess({
    command: process.execPath, args: [path.join(context.directory, file)],
    cwd: context.backendRoot, env: context.env,
    timeoutMs: context.policy.testTimeoutMs, deadlineMs: context.policy.deadlineMs
  }, context.dependencies);
  if (outcome.status !== 'PASS') {
    processRunner.writeCapturedOutput(outcome, context);
  }
  context.stdout.write(`${processRunner.formatOutcome(file, outcome)}\n`);
  return { file, ...outcome };
}

function runSuite(options = {}, dependencies = {}) {
  const env = options.env || process.env;
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const now = dependencies.now || Date.now;
  const startedAt = now();
  const catalog = options.catalog || discoverFiles(options.directory);
  const files = selectedFiles(options.args || [], catalog);
  const context = {
    backendRoot: options.backendRoot || path.join(__dirname, '..'),
    directory: options.directory || __dirname, dependencies, env, stdout, stderr, now,
    policy: createPolicy(env, startedAt)
  };
  const outcomes = files.map((file) => executeFile(file, context));
  const counts = resultCounts(outcomes);
  stdout.write(`${summaryLine(files.length, counts, Math.max(0, now() - startedAt))}\n`);
  return { files, outcomes, ...counts };
}

function printCatalog(files, stdout = process.stdout) {
  stdout.write(`${files.join('\n')}\n`);
}

function main(args = process.argv.slice(2), options = {}) {
  const catalog = options.catalog || discoverFiles(options.directory);
  if (args.includes('--list')) return printCatalog(catalog, options.stdout);
  try {
    const result = runSuite({ ...options, args, catalog }, options.dependencies);
    process.exitCode = result.failed || result.timedOut ? 1 : 0;
    return result;
  } catch (error) {
    const stderr = options.stderr || process.stderr;
    stderr.write(`[FAIL] Biocenose runner error=${error.message}\n`);
    stderr.write('Biocenose summary: total=0 passed=0 failed=1 timedOut=0 durationMs=0\n');
    process.exitCode = 1;
    return { files: [], outcomes: [], passed: 0, failed: 1, timedOut: 0 };
  }
}

if (require.main === module) main();

module.exports = {
  createPolicy, discoverFiles, main, printCatalog, runSuite, selectedFiles, summaryLine
};
