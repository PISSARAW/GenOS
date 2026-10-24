'use strict';

const { summarizeTrial } = require('./outcome-metrics.cjs');

const MECHANISMS = Object.freeze([
  'strategic-silence', 'selective-multicast', 'zero-text', 'g-cir', 'transactive-memory'
]);

function assertSameTasks(baseline, candidate) {
  const expected = baseline.tasks.map((row) => row.taskId).sort();
  const actual = candidate.tasks.map((row) => row.taskId).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error('Ablation changed the shared task set.');
  }
}

function assertTaskSetMatchesBaseline(taskSet, baseline) {
  const expected = taskSet.map((task) => task.id || task.taskId).sort();
  const actual = baseline.tasks.map((row) => row.taskId).sort();
  if (expected.some((id) => typeof id !== 'string')
    || JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error('Baseline does not cover the declared shared task set.');
  }
}

async function runOne(input, mechanism) {
  const result = await input.run({ taskSet: JSON.parse(JSON.stringify(input.taskSet)), disabledMechanism: mechanism,
    scenario: input.scenario, seed: input.seed });
  if (result.appliedAblation !== mechanism || !result.trial) {
    throw new Error(`Runtime did not confirm ablation '${mechanism}'.`);
  }
  assertSameTasks(input.baseline, result.trial);
  return { mechanism, trial: result.trial, metrics: summarizeTrial(result.trial) };
}

async function runAblationCampaign(input) {
  if (!Array.isArray(input.taskSet) || !input.baseline || typeof input.run !== 'function') {
    throw new Error('Ablation campaign requires tasks, baseline, and an execution adapter.');
  }
  assertTaskSetMatchesBaseline(input.taskSet, input.baseline);
  const results = [];
  for (const mechanism of MECHANISMS) results.push(await runOne(input, mechanism));
  return { baseline: summarizeTrial(input.baseline), ablations: results };
}

module.exports = { MECHANISMS, runAblationCampaign };
