'use strict';

function summarizeTrialValue1(__genosValueScope1) {
  return __genosValueScope1.totalCostUsd !== null && __genosValueScope1.verifiedActions > 0
      ? __genosValueScope1.totalCostUsd / __genosValueScope1.verifiedActions : null;
}

function summarizeTrialValue2(__genosValueScope2) {
  return __genosValueScope2.usage.length && __genosValueScope2.usage.every((item) => item.usageCoverage === 'complete')
      ? 'complete' : 'lower-bound';
}

function summarizeTrialValue3(__genosValueScope3) {
  return __genosValueScope3.rows.every((row) => __genosValueScope3.Number.isFinite(row.latencyMs) && row.latencyMs >= 0)
      ? __genosValueScope3.rows.reduce((sum, row) => sum + row.latencyMs, 0) : null;
}

function summarizeTrialValue4(__genosValueScope4) {
  return {
    runId: __genosValueScope4.trial.runId, armId: __genosValueScope4.trial.armId, scenarioId: __genosValueScope4.trial.scenarioId, seed: __genosValueScope4.trial.seed,
    tasks: __genosValueScope4.rows.length,
    verifiedActions: __genosValueScope4.verifiedActions,
    verifiedActionRate: __genosValueScope4.rows.length ? __genosValueScope4.verifiedActions / __genosValueScope4.rows.length : 0,
    usefulMessages: __genosValueScope4.rows.filter((row) => row.usefulMessage === true).length,
    informationLossCount: __genosValueScope4.rows.filter((row) => row.informationLost).length,
    llmCalls: __genosValueScope4.usage.reduce((sum, item) => sum + (0, __genosValueScope4.Number)(item.calls || 0), 0),
    inputTokens: __genosValueScope4.usage.reduce((sum, item) => sum + (0, __genosValueScope4.Number)(item.inputTokens || 0), 0),
    outputTokens: __genosValueScope4.usage.reduce((sum, item) => sum + (0, __genosValueScope4.Number)(item.outputTokens || 0), 0),
    cachedInputTokens: __genosValueScope4.usage.reduce((sum, item) => sum + (0, __genosValueScope4.Number)(item.cachedInputTokens || 0), 0),
    tokenCoverage: (0, __genosValueScope4.require)('./outcome-metricsValues1.cjs').summarizeTrialValue2({ usage: __genosValueScope4.usage }),
    totalCostUsd: __genosValueScope4.totalCostUsd,
    costPerVerifiedActionUsd: (0, __genosValueScope4.require)('./outcome-metricsValues1.cjs').summarizeTrialValue1({ totalCostUsd: __genosValueScope4.totalCostUsd, verifiedActions: __genosValueScope4.verifiedActions }),
    latencyMs: (0, __genosValueScope4.require)('./outcome-metricsValues1.cjs').summarizeTrialValue3({ Number: __genosValueScope4.Number, rows: __genosValueScope4.rows }),
    cpuMs: (0, __genosValueScope4.sumField)(__genosValueScope4.rows, 'cpuMs'), gpuMs: (0, __genosValueScope4.sumField)(__genosValueScope4.rows, 'gpuMs'),
    peakVramBytes: __genosValueScope4.rows.every((row) => __genosValueScope4.Number.isFinite(row.resourceUse?.vramBytes)
      && row.resourceUse.vramBytes >= 0)
      ? __genosValueScope4.Math.max(0, ...__genosValueScope4.rows.map((row) => row.resourceUse.vramBytes)) : null,
    energyJoules: (0, __genosValueScope4.sumField)(__genosValueScope4.rows, 'energyJoules')
  };
}

module.exports = { summarizeTrialValue1, summarizeTrialValue2, summarizeTrialValue3, summarizeTrialValue4 };
