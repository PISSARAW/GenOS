'use strict';

const { ARMS } = require('./longitudinalBenchmarkServiceConstants');
const { invalid, nonNegative, validateRun, validateRuntimeReceipt } = require('./longitudinalRunValidation');

function createState(input, missionIds) {
  return {
    input, missionIds, arms: {}, startedAt: Date.now(),
    elapsedBeforeResume: Number(input.elapsedBeforeResume) || 0,
    totalCost: 0, totalTokens: 0, budget: input.budget || {}
  };
}

function assertActive(state) {
  if (state.input.signal?.aborted) throw invalid('Campaign was aborted.', 'HOLOBIONT_BENCHMARK_ABORTED');
  if (Number.isFinite(state.budget.maxTimeMs)
    && state.elapsedBeforeResume + Date.now() - state.startedAt >= state.budget.maxTimeMs) {
    throw invalid('Campaign time budget exhausted.', 'HOLOBIONT_BENCHMARK_TIME_BUDGET_EXHAUSTED');
  }
}

function assertBudget(state) {
  if ((Number.isFinite(state.budget.maxCost) && state.totalCost > state.budget.maxCost)
    || (Number.isFinite(state.budget.maxTokens) && state.totalTokens > state.budget.maxTokens)) {
    throw invalid('Campaign cost or token budget exhausted.', 'HOLOBIONT_BENCHMARK_BUDGET_EXHAUSTED');
  }
}

function accountRun(state, run) {
  state.totalCost += nonNegative(run.cost, 'cost');
  state.totalTokens += nonNegative(run.tokens, 'tokens');
}

function resumeRun(state, arm, index) {
  const missionId = state.missionIds[index];
  const saved = state.input.resumeRuns?.[arm]?.[missionId];
  if (!saved) return false;
  if (saved.missionId !== missionId) throw invalid(`Resume journal mission mismatch for ${arm}.`);
  validateRuntimeReceipt(saved, arm);
  const normalized = validateRun(saved, arm);
  state.arms[arm].push({ ...saved, ...normalized, sequence: index });
  accountRun(state, normalized);
  assertBudget(state);
  return true;
}

async function executeRun(state, arm, index) {
  const mission = state.input.missions[index];
  const remainingBudget = {
    maxCost: state.budget.maxCost - state.totalCost,
    maxTokens: state.budget.maxTokens - state.totalTokens,
    maxTimeMs: state.budget.maxTimeMs - state.elapsedBeforeResume - (Date.now() - state.startedAt)
  };
  const result = await state.input.runMission({ arm, mission, sequence: index, remainingBudget });
  if (result?.missionId && result.missionId !== state.missionIds[index]) {
    throw invalid(`Runner returned an out-of-sequence mission for ${arm}.`);
  }
  if (state.input.requireRuntimeReceipt) validateRuntimeReceipt(result, arm);
  const run = { ...result, ...validateRun({ ...result, missionId: state.missionIds[index] }, arm) };
  state.arms[arm].push(run);
  accountRun(state, run);
  if (typeof state.input.onRun === 'function') {
    await state.input.onRun({ arm, mission, sequence: index, result: run });
  }
  assertActive(state);
  assertBudget(state);
}

async function executeRuns(options) {
  const { input, missionIds } = options;
  const state = createState(input, missionIds);
  for (const arm of ARMS) {
    state.arms[arm] = [];
    for (let index = 0; index < input.missions.length; index += 1) {
      assertActive(state);
      if (!resumeRun(state, arm, index)) await executeRun(state, arm, index);
    }
  }
  return state.arms;
}

module.exports = { executeRuns };
