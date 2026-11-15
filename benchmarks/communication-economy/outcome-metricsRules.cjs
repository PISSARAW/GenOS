'use strict';

function summarizeTrialRule1(context) {
  return context.totalCostUsd !== null && context.verifiedActions > 0
      ? context.totalCostUsd / context.verifiedActions : null;
}

function summarizeTrialRule2(context) {
  return context.usage.length && context.usage.every((item) => item.usageCoverage === 'complete')
      ? 'complete' : 'lower-bound';
}

function summarizeTrialRule3(context) {
  return context.rows.every((row) => context.Number.isFinite(row.latencyMs) && row.latencyMs >= 0)
      ? context.rows.reduce((sum, row) => sum + row.latencyMs, 0) : null;
}

function summarizeTrialRule4(context) {
  return {
    runId: context.trial.runId, armId: context.trial.armId, scenarioId: context.trial.scenarioId, seed: context.trial.seed,
    tasks: context.rows.length,
    verifiedActions: context.verifiedActions,
    verifiedActionRate: context.rows.length ? context.verifiedActions / context.rows.length : 0,
    usefulMessages: context.rows.filter((row) => row.usefulMessage === true).length,
    informationLossCount: context.rows.filter((row) => row.informationLost).length,
    llmCalls: context.usage.reduce((sum, item) => sum + context.Number(item.calls || 0), 0),
    inputTokens: context.usage.reduce((sum, item) => sum + context.Number(item.inputTokens || 0), 0),
    outputTokens: context.usage.reduce((sum, item) => sum + context.Number(item.outputTokens || 0), 0),
    cachedInputTokens: context.usage.reduce((sum, item) => sum + context.Number(item.cachedInputTokens || 0), 0),
    tokenCoverage: context.require('./outcome-metricsRules.cjs').summarizeTrialRule2({ usage: context.usage }),
    totalCostUsd: context.totalCostUsd,
    costPerVerifiedActionUsd: context.require('./outcome-metricsRules.cjs').summarizeTrialRule1({ totalCostUsd: context.totalCostUsd, verifiedActions: context.verifiedActions }),
    latencyMs: context.require('./outcome-metricsRules.cjs').summarizeTrialRule3({ Number: context.Number, rows: context.rows }),
    cpuMs: context.sumField(context.rows, 'cpuMs'), gpuMs: context.sumField(context.rows, 'gpuMs'),
    peakVramBytes: context.rows.every((row) => context.Number.isFinite(row.resourceUse?.vramBytes)
      && row.resourceUse.vramBytes >= 0)
      ? context.Math.max(0, ...context.rows.map((row) => row.resourceUse.vramBytes)) : null,
    energyJoules: context.sumField(context.rows, 'energyJoules')
  };
}

module.exports = { summarizeTrialRule1, summarizeTrialRule2, summarizeTrialRule3, summarizeTrialRule4 };
