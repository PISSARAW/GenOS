'use strict';

const { PROTOCOL, assertProtocol } = require('./protocol.cjs');
const { summarizeTrial } = require('./outcome-metrics.cjs');

function taskIds(trial) {
  return trial.tasks.map((row) => row.taskId).sort();
}

function assertMatched(trials) {
  if (!Array.isArray(trials) || !trials.length) throw new Error('Campaign requires at least one trial.');
  const expectedArms = PROTOCOL.arms.map((arm) => arm.id).sort();
  const groups = new Map();
  for (const trial of trials) {
    const key = `${trial.scenarioId}:${trial.seed}`;
    const group = groups.get(key) || [];
    if (group.some((item) => item.armId === trial.armId)) throw new Error(`Duplicate arm in ${key}.`);
    group.push(trial);
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    if (JSON.stringify(group.map((item) => item.armId).sort()) !== JSON.stringify(expectedArms)) {
      throw new Error(`Campaign arms are incomplete for ${key}.`);
    }
    const reference = group[0];
    for (const trial of group.slice(1)) {
      if (trial.model !== reference.model || trial.provider !== reference.provider
        || JSON.stringify(taskIds(trial)) !== JSON.stringify(taskIds(reference))) {
        throw new Error(`Model, provider, or task set differs in ${key}.`);
      }
    }
  }
  return groups;
}

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function bootstrapInterval(values, seed) {
  if (!values.length) return null;
  const next = randomGenerator(seed);
  const estimates = [];
  for (let sample = 0; sample < 2000; sample += 1) {
    let total = 0;
    for (let i = 0; i < values.length; i += 1) total += values[Math.floor(next() * values.length)];
    estimates.push(total / values.length);
  }
  estimates.sort((a, b) => a - b);
  return { low95: estimates[Math.floor(estimates.length * 0.025)],
    high95: estimates[Math.floor(estimates.length * 0.975)] };
}

function metricMap(group, field) {
  return new Map(group.map((trial) => [`${trial.scenarioId}:${trial.seed}:${trial.armId}`,
    summarizeTrial(trial)[field]]));
}

function pairedDeltas(input) {
  const baseline = metricMap(input.group, input.field);
  return input.group.filter((trial) => trial.armId === input.candidateId).map((trial) => {
    const key = `${trial.scenarioId}:${trial.seed}:${input.baselineId}`;
    const before = baseline.get(key);
    const after = summarizeTrial(trial)[input.field];
    return Number.isFinite(before) && Number.isFinite(after) ? after - before : null;
  }).filter((value) => value !== null);
}

function comparison(group, candidateId) {
  const cost = pairedDeltas({ group, baselineId: 'naive-broadcast', candidateId,
    field: 'costPerVerifiedActionUsd' });
  const quality = pairedDeltas({ group, baselineId: 'naive-broadcast', candidateId,
    field: 'verifiedActionRate' });
  return { candidateArm: candidateId,
    costPerVerifiedActionDeltaUsd: cost.length ? cost.reduce((sum, value) => sum + value, 0) / cost.length : null,
    costDeltaBootstrap95: bootstrapInterval(cost, 31),
    verifiedActionRateDelta: quality.length ? quality.reduce((sum, value) => sum + value, 0) / quality.length : null,
    qualityDeltaBootstrap95: bootstrapInterval(quality, 47), pairedSeeds: Math.min(cost.length, quality.length) };
}

function buildCampaignReport(trials) {
  assertProtocol();
  const groups = assertMatched(trials);
  const scenarios = new Map();
  for (const trial of trials) {
    const rows = scenarios.get(trial.scenarioId) || [];
    rows.push(trial);
    scenarios.set(trial.scenarioId, rows);
  }
  return { protocolVersion: PROTOCOL.protocolVersion, comparisonMethod: 'paired-seed percentile bootstrap, 2000 resamples',
    scenarios: [...scenarios].map(([scenarioId, rows]) => ({ scenarioId,
      trials: rows.map(summarizeTrial), comparisons: PROTOCOL.arms
        .filter((arm) => arm.id !== 'naive-broadcast')
        .map((arm) => comparison(rows, arm.id)) })), matchedSeedGroups: groups.size };
}

module.exports = { assertMatched, buildCampaignReport, bootstrapInterval };
