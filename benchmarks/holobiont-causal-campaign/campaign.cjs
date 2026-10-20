'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const oracle = require('./independent-oracle.cjs');

const WORKER = path.join(__dirname, 'arm-worker.cjs');
const DEFAULT_CASES = path.join(__dirname, 'cases.json');
const BOUNDS = Object.freeze({ maxCases: 20, maxRepetitions: 10, maxRunTimeMs: 10000 });

function fail(message, code = 'HOLOBIONT_CAUSAL_CAMPAIGN_INVALID') {
  return Object.assign(new Error(message), { code });
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readCases(file = DEFAULT_CASES) {
  const source = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const cases = source?.cases;
  if (!Array.isArray(cases) || cases.length < 1 || cases.length > BOUNDS.maxCases) {
    throw fail(`Campaign requires 1 to ${BOUNDS.maxCases} cases.`);
  }
  const ids = cases.map((entry) => String(entry?.id || '').trim());
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw fail('Case identifiers must be unique.');
  cases.forEach((entry) => oracle.expectedValue(entry));
  return { cases, path: path.resolve(file), sha256: sha256(path.resolve(file)) };
}

function processArm({ arm, testCase, repetition, timeoutMs }) {
  const stdout = execFileSync(process.execPath, [WORKER, arm], {
    input: JSON.stringify({ testCase, repetition }), encoding: 'utf8',
    timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024
  });
  return JSON.parse(stdout);
}

function assertIsolation(repetition) {
  const baseline = repetition.arms.baseline.isolation;
  const holobiont = repetition.arms.holobiont.isolation;
  const isolated = baseline?.kind === 'dedicated-process' && holobiont?.kind === 'dedicated-process'
    && baseline.pid !== holobiont.pid && holobiont.database === 'sqlite-memory';
  if (!isolated) throw fail('Campaign arms did not execute in isolated processes.', 'HOLOBIONT_CAUSAL_ISOLATION_FAILED');
}

function runRepetition(testCase, context) {
  const arms = {};
  for (const arm of ['baseline', 'holobiont']) {
    arms[arm] = context.runArm({ arm, testCase, repetition: context.repetition,
      timeoutMs: context.timeoutMs });
    arms[arm].oracle = oracle.evaluate(testCase, arms[arm].output);
  }
  const result = { index: context.repetition, arms,
    status: Object.values(arms).every((entry) => entry.oracle.status === 'PASS') ? 'PASS' : 'FAIL' };
  if (context.enforceProcessIsolation) assertIsolation(result);
  return result;
}

function runCase(testCase, context) {
  const repetitions = [];
  for (let index = 0; index < context.repetitions; index += 1) {
    repetitions.push(runRepetition(testCase, { ...context, repetition: index }));
  }
  return { caseId: testCase.id, status: repetitions.every((entry) => entry.status === 'PASS') ? 'PASS' : 'FAIL',
    repetitions };
}

function validateOptions(options) {
  const repetitions = Number(options.repetitions ?? 3);
  const timeoutMs = Number(options.timeoutMs ?? BOUNDS.maxRunTimeMs);
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > BOUNDS.maxRepetitions) {
    throw fail(`Repetitions must be between 1 and ${BOUNDS.maxRepetitions}.`);
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > BOUNDS.maxRunTimeMs) {
    throw fail(`Per-run timeout must be between 1 and ${BOUNDS.maxRunTimeMs} ms.`);
  }
  return { repetitions, timeoutMs };
}

function runCampaign(options = {}) {
  const config = validateOptions(options);
  const fixture = readCases(options.casesPath);
  const runArm = options.runArm || processArm;
  const cases = fixture.cases.map((testCase) => runCase(testCase, {
    ...config, runArm, enforceProcessIsolation: options.enforceProcessIsolation !== false
  }));
  return {
    schema: 'genos.holobiont-causal-campaign/v1',
    campaignId: options.campaignId || 'holobiont-causal-bounded',
    generatedAt: new Date().toISOString(),
    bounds: { cases: cases.length, repetitions: config.repetitions,
      totalArmRuns: cases.length * config.repetitions * 2, perRunTimeMs: config.timeoutMs },
    provenance: {
      cases: { path: fixture.path, sha256: fixture.sha256 },
      oracle: { id: oracle.ORACLE_ID, path: require.resolve('./independent-oracle.cjs'),
        sha256: sha256(require.resolve('./independent-oracle.cjs')) },
      worker: { path: WORKER, sha256: sha256(WORKER) }
    },
    status: cases.every((entry) => entry.status === 'PASS') ? 'PASS' : 'FAIL',
    cases
  };
}

module.exports = { BOUNDS, processArm, readCases, runCampaign };
