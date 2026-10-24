'use strict';

function sumField(rows, field) {
  if (rows.some((row) => !Number.isFinite(row.resourceUse?.[field]) || row.resourceUse[field] < 0)) return null;
  return rows.reduce((sum, row) => sum + row.resourceUse[field], 0);
}

function allCostsKnown(rows) {
  return rows.every((row) => Number.isFinite(row.episodeCostUsd));
}

function summarizeTrial(trial) {
  const rows = trial.tasks || [];
  const usage = rows.map((row) => row.usage || {});
  const verifiedActions = rows.filter((row) => row.verifiedAction).length;
  const totalCostUsd = allCostsKnown(rows)
    ? rows.reduce((sum, row) => sum + row.episodeCostUsd, 0) : null;
  return {
    runId: trial.runId, armId: trial.armId, scenarioId: trial.scenarioId, seed: trial.seed,
    tasks: rows.length,
    verifiedActions,
    verifiedActionRate: rows.length ? verifiedActions / rows.length : 0,
    usefulMessages: rows.filter((row) => row.usefulMessage === true).length,
    informationLossCount: rows.filter((row) => row.informationLost).length,
    llmCalls: usage.reduce((sum, item) => sum + Number(item.calls || 0), 0),
    inputTokens: usage.reduce((sum, item) => sum + Number(item.inputTokens || 0), 0),
    outputTokens: usage.reduce((sum, item) => sum + Number(item.outputTokens || 0), 0),
    cachedInputTokens: usage.reduce((sum, item) => sum + Number(item.cachedInputTokens || 0), 0),
    tokenCoverage: usage.length && usage.every((item) => item.usageCoverage === 'complete')
      ? 'complete' : 'lower-bound',
    totalCostUsd,
    costPerVerifiedActionUsd: totalCostUsd !== null && verifiedActions > 0
      ? totalCostUsd / verifiedActions : null,
    latencyMs: rows.every((row) => Number.isFinite(row.latencyMs) && row.latencyMs >= 0)
      ? rows.reduce((sum, row) => sum + row.latencyMs, 0) : null,
    cpuMs: sumField(rows, 'cpuMs'), gpuMs: sumField(rows, 'gpuMs'),
    peakVramBytes: rows.every((row) => Number.isFinite(row.resourceUse?.vramBytes)
      && row.resourceUse.vramBytes >= 0)
      ? Math.max(0, ...rows.map((row) => row.resourceUse.vramBytes)) : null,
    energyJoules: sumField(rows, 'energyJoules')
  };
}

module.exports = { summarizeTrial };
