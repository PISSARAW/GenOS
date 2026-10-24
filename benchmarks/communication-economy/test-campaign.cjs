'use strict';

const assert = require('node:assert/strict');
const { buildCampaignReport, bootstrapInterval } = require('./campaign.cjs');

function trial(armId, seed, cost) {
  return { runId: `run-${armId}-${seed}`, armId, scenarioId: 'pilot-10x100', seed,
    model: 'same-model', provider: 'same-provider', tasks: [{ taskId: 'task-1',
      verifiedAction: true, informationLost: false, episodeCostUsd: cost,
      usage: { usageCoverage: 'complete', calls: 1, inputTokens: 20, outputTokens: 4,
        cachedInputTokens: 2 } }] };
}

const trials = [];
for (const seed of [7, 21]) {
  trials.push(trial('naive-broadcast', seed, 4), trial('genos-zero-text', seed, 2),
    trial('genos-d-full', seed, 1), trial('agentsociety', seed, 3));
}
const report = buildCampaignReport(trials);
assert.equal(report.matchedSeedGroups, 2);
assert.equal(report.scenarios[0].comparisons.find((row) => row.candidateArm === 'genos-d-full')
  .costPerVerifiedActionDeltaUsd, -3);
assert.deepEqual(bootstrapInterval([2, 2, 2], 31), { low95: 2, high95: 2 });
assert.throws(() => buildCampaignReport(trials.slice(1)));
assert.throws(() => buildCampaignReport(trials.map((row, index) => index === 2
  ? { ...row, provider: 'different' } : row)));
console.log('communication-economy campaign report: ok');
