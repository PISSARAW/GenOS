'use strict';

function computeMetricsRule1(context) {
  return context.evaluation?.verified === true
    && context.evaluation.verifierId && context.evaluation.verifierId !== context.summary.orchestratorId
    && /^[a-f0-9]{64}$/.test(context.evaluation.evidenceHash || '')
    && context.Number.isFinite(context.evaluation.pressureBefore) && context.evaluation.pressureBefore >= 0
    && context.evaluation.pressureBefore <= 1 && context.Number.isFinite(context.evaluation.pressureAfter);
}

function computeMetricsRule2(context) {
  return context.usage?.schema !== 'genos.measured-model-usage/v1' || context.usage.complete !== true
    || context.usage.allRunsCompleted !== true || !context.Number.isSafeInteger(context.usage.totalTokens)
    || !context.Number.isFinite(context.usage.totalCostUsd) || context.usage.totalCostUsd < 0;
}

function computeMetricsRule3(context) {
  return { success: true, regressions: context.regressions, humanInterventions: context.humanInterventions,
    durationMs: context.Number.isFinite(context.artifact.durationMs) ? context.artifact.durationMs : 0,
    costUsd: context.usage.totalCostUsd, tokens: context.usage.totalTokens,
    painObserved: context.Boolean(context.pain), painObservationHash: context.pain?.payload.evidenceHash || null,
    developmentalPressureBefore: context.pressure?.pressureBefore ?? null,
    developmentalPressureAfter: context.pressure?.pressureAfter ?? null,
    pressureEvidenceHash: context.pressure?.evidenceHash || null };
}

function computeMetricsRule4(context) {
  return context.artifact.exitCode !== 0 || context.artifact.error || context.summary.success !== true
    || context.summary.completionGate?.allowed !== true;
}

function computeMetricsRule5(context) {
  return context.require('./field-campaign-genos-repository-adapterRules.cjs').computeMetricsRule1({ Number: context.Number, evaluation: context.evaluation, summary: context.summary })
    && context.evaluation.pressureAfter >= 0 && context.evaluation.pressureAfter <= 1
    ? context.evaluation : null;
}

module.exports = { computeMetricsRule1, computeMetricsRule2, computeMetricsRule3, computeMetricsRule4, computeMetricsRule5 };
