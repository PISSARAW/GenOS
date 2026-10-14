'use strict';

const immune = require('../src/services/immuneSystem');

function fromBudgetStop(ctx, budgetStopped) {
  const text = String(ctx.finalReportText || '').trim();
  if (!text) return null;
  const parsed = immune.phagocytoseCodexReport(text, {
    agentName: ctx.agentName, nameMeaning: ctx.nameMeaning, role: ctx.mission?.role
  });
  const source = parsed.ok ? parsed.report : { claims: [], uncertainties: [], tests: [], artifactText: text };
  return { ...source, reportedOutcome: source.outcome || null, outcome: 'partial', partial: true,
    budgetStop: budgetStopped };
}

module.exports = { fromBudgetStop };
