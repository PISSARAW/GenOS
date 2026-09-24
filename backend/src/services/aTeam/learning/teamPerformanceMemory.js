'use strict';

function summarizePerformance(debriefs = []) {
  const rows = Array.isArray(debriefs) ? debriefs : [];
  const count = rows.length;
  const mean = (key) => count ? rows.reduce((sum, row) => sum + (Number(row.metrics?.[key]) || 0), 0) / count : null;
  return {
    sampleCount: count,
    successRate: count ? rows.filter((row) => row.objectiveMet).length / count : null,
    completionRate: mean('completionRate'),
    reworkRate: mean('reworkRate'),
    handoffAcceptanceRate: mean('handoffAcceptanceRate'),
    evidenceIds: [...new Set(rows.flatMap((row) => row.evidenceIds || []))]
  };
}

module.exports = { summarizePerformance };
