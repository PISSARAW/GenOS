'use strict';

function computeMetricsValue1(__genosValueScope1) {
  return __genosValueScope1.evaluation?.verified === true
    && __genosValueScope1.evaluation.verifierId && __genosValueScope1.evaluation.verifierId !== __genosValueScope1.summary.orchestratorId
    && /^[a-f0-9]{64}$/.test(__genosValueScope1.evaluation.evidenceHash || '')
    && __genosValueScope1.Number.isFinite(__genosValueScope1.evaluation.pressureBefore) && __genosValueScope1.evaluation.pressureBefore >= 0
    && __genosValueScope1.evaluation.pressureBefore <= 1 && __genosValueScope1.Number.isFinite(__genosValueScope1.evaluation.pressureAfter);
}

function computeMetricsValue2(__genosValueScope2) {
  return __genosValueScope2.usage?.schema !== 'genos.measured-model-usage/v1' || __genosValueScope2.usage.complete !== true
    || __genosValueScope2.usage.allRunsCompleted !== true || !__genosValueScope2.Number.isSafeInteger(__genosValueScope2.usage.totalTokens)
    || !__genosValueScope2.Number.isFinite(__genosValueScope2.usage.totalCostUsd) || __genosValueScope2.usage.totalCostUsd < 0;
}

function computeMetricsValue3(__genosValueScope3) {
  return { success: true, regressions: __genosValueScope3.regressions, humanInterventions: __genosValueScope3.humanInterventions,
    durationMs: __genosValueScope3.Number.isFinite(__genosValueScope3.artifact.durationMs) ? __genosValueScope3.artifact.durationMs : 0,
    costUsd: __genosValueScope3.usage.totalCostUsd, tokens: __genosValueScope3.usage.totalTokens,
    painObserved: (0, __genosValueScope3.Boolean)(__genosValueScope3.pain), painObservationHash: __genosValueScope3.pain?.payload.evidenceHash || null,
    developmentalPressureBefore: __genosValueScope3.pressure?.pressureBefore ?? null,
    developmentalPressureAfter: __genosValueScope3.pressure?.pressureAfter ?? null,
    pressureEvidenceHash: __genosValueScope3.pressure?.evidenceHash || null };
}

function computeMetricsValue4(__genosValueScope4) {
  return __genosValueScope4.artifact.exitCode !== 0 || __genosValueScope4.artifact.error || __genosValueScope4.summary.success !== true
    || __genosValueScope4.summary.completionGate?.allowed !== true;
}

function computeMetricsValue5(__genosValueScope5) {
  return (0, __genosValueScope5.require)('./field-campaign-genos-repository-adapterValues1.cjs').computeMetricsValue1({ Number: __genosValueScope5.Number, evaluation: __genosValueScope5.evaluation, summary: __genosValueScope5.summary })
    && __genosValueScope5.evaluation.pressureAfter >= 0 && __genosValueScope5.evaluation.pressureAfter <= 1
    ? __genosValueScope5.evaluation : null;
}

module.exports = { computeMetricsValue1, computeMetricsValue2, computeMetricsValue3, computeMetricsValue4, computeMetricsValue5 };
