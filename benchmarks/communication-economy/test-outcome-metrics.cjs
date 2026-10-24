'use strict';

const assert = require('node:assert/strict');
const { summarizeTrial } = require('./outcome-metrics.cjs');

const trial = { runId: 'run-1', armId: 'genos-d-full', scenarioId: 'pilot-10x100', seed: 7,
  tasks: [
    { verifiedAction: true, usefulMessage: true, informationLost: false, episodeCostUsd: 2,
      latencyMs: 20, resourceUse: { cpuMs: 5, gpuMs: 3, vramBytes: 200, energyJoules: 4 },
      usage: { calls: 1, inputTokens: 10, outputTokens: 3, cachedInputTokens: 2, usageCoverage: 'complete' } },
    { verifiedAction: false, usefulMessage: false, informationLost: true, episodeCostUsd: 1,
      latencyMs: 10, resourceUse: { cpuMs: 2, gpuMs: 1, vramBytes: 100, energyJoules: 2 },
      usage: { calls: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, usageCoverage: 'complete' } }
  ] };
const result = summarizeTrial(trial);
assert.equal(result.verifiedActionRate, 0.5);
assert.equal(result.costPerVerifiedActionUsd, 3);
assert.equal(result.informationLossCount, 1);
assert.equal(result.cachedInputTokens, 2);
assert.equal(result.peakVramBytes, 200);
assert.equal(summarizeTrial({ ...trial, tasks: [{ ...trial.tasks[0], episodeCostUsd: null }] }).totalCostUsd, null);
console.log('communication-economy outcome metrics: ok');
