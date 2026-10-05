'use strict';

const catalog = require('../../../../fixtures/syncytium/missionCatalog.json');
const runner = require('./biologicalBenchmarkRunnerService');

async function runMatrix(input, db) {
  const manifests = validateMatrix(input);
  const startedAtUtc = new Date().toISOString();
  const startedAtMs = Date.now();
  const reports = [];
  for (const scenario of catalog.cases) {
    if (input.maxRuntimeMs && Date.now() - startedAtMs >= input.maxRuntimeMs) break;
    const manifest = manifests.get(scenario.id);
    reports.push({ caseId: scenario.id, report: await runner.runCampaign(manifest, db) });
  }
  const observed = { tokens: sumMeasured(reports, 'tokens'),
    costUsd: sumMeasured(reports, 'costUsd') };
  const missing = catalog.cases.map((item) => item.id)
    .filter((id) => !reports.some((item) => item.caseId === id));
  const pass = missing.length === 0 && reports.every((item) =>
    item.report.comparable && item.report.campaignBudgetVerified
    && item.report.runs.filter((run) => run.variant === 'syncytium').every((run) => run.complete))
    && observed.tokens !== null && observed.costUsd !== null
    && observed.tokens <= input.matrixBudget.tokens
    && observed.costUsd <= input.matrixBudget.costUsd;
  return { contract: 'GenOSSyncytiumMissionMatrix/v1',
    startedAtUtc, completedAtUtc: new Date().toISOString(),
    expectedCases: catalog.cases.length, executedCases: reports.length,
    missing, observed, matrixBudget: input.matrixBudget, pass, reports };
}

function sumMeasured(reports, dimension) {
  const values = reports.map((item) => item.report.aggregateUsage[dimension]);
  return values.length && values.every(Number.isFinite)
    ? values.reduce((sum, value) => sum + value, 0) : null;
}

function validateMatrix(input) {
  if (!Array.isArray(input?.cases) || input.cases.length !== catalog.cases.length) {
    throw invalid(`The matrix requires exactly ${catalog.cases.length} case manifests.`);
  }
  const manifests = new Map();
  for (const manifest of input.cases) {
    runner.validateManifest(manifest);
    if (!manifest.caseId || manifests.has(manifest.caseId)
      || !Array.isArray(manifest.oracle?.assertions) || !manifest.oracle.assertions.length) {
      throw invalid('Each case needs a unique catalog ID and a non-empty independent oracle.');
    }
    manifests.set(manifest.caseId, manifest);
  }
  if (catalog.cases.some((scenario) => !manifests.has(scenario.id))) {
    throw invalid('The matrix must cover every catalog case once.');
  }
  const caps = [...manifests.values()].reduce((sum, manifest) => ({
    tokens: sum.tokens + manifest.campaignBudget.tokens,
    costUsd: sum.costUsd + manifest.campaignBudget.costUsd
  }), { tokens: 0, costUsd: 0 });
  if (!Number.isFinite(input.matrixBudget?.tokens) || input.matrixBudget.tokens < caps.tokens
    || !Number.isFinite(input.matrixBudget?.costUsd)
    || input.matrixBudget.costUsd < caps.costUsd) {
    throw invalid('matrixBudget must cover every declared campaign ceiling.');
  }
  if (input.maxRuntimeMs !== undefined
    && (!Number.isSafeInteger(input.maxRuntimeMs) || input.maxRuntimeMs < 10000)) {
    throw invalid('maxRuntimeMs must be a positive integer of at least 10000 ms.');
  }
  return manifests;
}

function invalid(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_MATRIX_INVALID' });
}

module.exports = { runMatrix, validateMatrix };
