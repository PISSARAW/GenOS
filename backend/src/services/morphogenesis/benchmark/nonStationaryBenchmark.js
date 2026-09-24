'use strict';

const { nonStationaryMission } = require('./nonStationaryMission');
const { BASELINES, baselineBudget } = require('./morphologyBaselines');

async function runPolicy(policy, mission, budget) {
  const results = [];
  for (const stage of mission) results.push(await policy.evaluate({ stage, budget }));
  return results;
}

function summarize(results) {
  const verifiedGain = results.reduce((sum, result) => sum + (Number(result && result.verifiedGain) || 0), 0);
  const totalCost = results.reduce((sum, result) => sum + (Number(result && result.totalCost) || 0), 0);
  return { verifiedGain, totalCost, efficiency: totalCost > 0 ? verifiedGain / totalCost : 0, stages: results.length };
}

async function runNonStationaryBenchmark(input = {}) {
  if (!input.policies || typeof input.policies !== 'object') throw new Error('baseline policy adapters are required');
  const mission = nonStationaryMission();
  const perPolicyBudget = baselineBudget(input.totalBudget, BASELINES.length);
  const missing = BASELINES.filter((name) => !input.policies[name] || typeof input.policies[name].evaluate !== 'function');
  if (missing.length) throw new Error(`missing baseline adapters: ${missing.join(', ')}`);
  const output = {};
  for (const name of BASELINES) output[name] = summarize(await runPolicy(input.policies[name], mission, perPolicyBudget));
  return { mission, budgetPerPolicy: perPolicyBudget, policies: output, sequenceConstrained: false };
}

module.exports = { runNonStationaryBenchmark, summarize };
