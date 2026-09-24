'use strict';

function buildTeamDebrief(input = {}) {
  const run = input.teamRun || {};
  const metrics = input.metrics || {};
  return {
    teamRunId: run.teamRunId || null,
    outcome: run.status || 'UNKNOWN',
    objectiveMet: input.objectiveMet === true,
    lessons: normalizeLessons(input.lessons),
    metrics: {
      completionRate: unit(metrics.completionRate),
      reworkRate: unit(metrics.reworkRate),
      handoffAcceptanceRate: unit(metrics.handoffAcceptanceRate),
      budgetEfficiency: unit(metrics.budgetEfficiency)
    },
    evidenceIds: Array.isArray(input.evidenceIds) ? input.evidenceIds.filter(Boolean) : [],
    createdAt: input.createdAt || new Date().toISOString()
  };
}

function normalizeLessons(lessons) {
  return (Array.isArray(lessons) ? lessons : []).filter((lesson) => lesson && lesson.statement).map((lesson) => ({
    statement: String(lesson.statement).trim(),
    category: lesson.category || 'general',
    evidenceId: lesson.evidenceId || null,
    reusable: lesson.reusable === true
  }));
}

function unit(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

module.exports = { buildTeamDebrief, normalizeLessons };
