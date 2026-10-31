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
  return require('./outcome-metricsValues1.cjs').summarizeTrialValue4({ Math, Number, require, rows, sumField, totalCostUsd, trial, usage, verifiedActions });
}

module.exports = { summarizeTrial };
