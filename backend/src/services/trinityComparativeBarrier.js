'use strict';

/**
 * @file trinityComparativeBarrier.js
 * @description Comparative evidence barrier for Trinity. It turns the three
 * worlds' real worker dossiers into world reports, scores them with the
 * domain-weighted model, records the comparison and exposes the
 * merge/escalation decision on the autonomy plan.
 */
const trinityService = require('./trinityService');
const { workerEvidenceDossiers } = require('./agentEvidenceService');
const { emit } = require('./agentOrchestrationState');

function latestReport(dossier) {
  const events = Array.isArray(dossier?.events) ? dossier.events : [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index] && events[index].evidenceReport) return events[index].evidenceReport;
  }
  const failure = [...events].reverse().find((event) => event && event.failure);
  return failure ? { outcome: 'failed', failure: failure.failure } : null;
}

function buildWorldReports(workers, dossiers, options = {}) {
  const byWorker = new Map((dossiers || []).map((dossier) => [dossier.workerId, dossier]));
  const members = Array.isArray(options.members) ? options.members : [];
  return (workers || []).map((worker, index) => {
    const member = members[index] || {};
    const report = latestReport(byWorker.get(worker.agentId));
    return {
      worldNumber: member.worldNumber || worker.worldNumber || index + 1,
      role: member.role || worker.role || worker.label || `world_${index + 1}`,
      agentId: worker.agentId || null,
      name: worker.name || null,
      outcome: report?.outcome || 'no_evidence',
      claims: Array.isArray(report?.claims) ? report.claims : [],
      tests: Array.isArray(report?.tests) ? report.tests : [],
      uncertainties: Array.isArray(report?.uncertainties) ? report.uncertainties : [],
      report: report || undefined
    };
  });
}

async function applyTrinityComparison(ctx) {
  const trinity = ctx && ctx.autonomyPlan ? ctx.autonomyPlan.trinity : null;
  if (!trinity || trinity.activated !== true) return null;
  const threshold = Number(trinity.threshold) || 0.70;
  const dossiers = ctx.usable || workerEvidenceDossiers(ctx.agentId, ctx.workers || []);
  const worldReports = buildWorldReports(ctx.workers || [], dossiers, { members: trinity.members || [] });
  const result = trinityService.mergeTrinityEvidence(worldReports, { domain: trinity.domain, threshold });
  await trinityService.recordWorldComparison(ctx.db, {
    missionId: trinity.missionId,
    orchestratorId: ctx.agentId,
    comparison: result.comparativeAnalysis,
    decision: { canMerge: result.canMerge, threshold }
  });
  trinity.comparison = {
    canMerge: result.canMerge,
    selectedWorld: result.selectedWorld,
    selectedRole: result.selectedRole || null,
    bestScore: result.bestScore,
    tied: result.comparativeAnalysis?.tied === true
  };
  emit(ctx.agentId, 'TRINITY_COMPARATIVE_BARRIER', 'COMPARE_TRINITY', result.canMerge
    ? `Trinity merged World ${result.selectedWorld} (${result.selectedRole}) score=${result.bestScore}.`
    : `Trinity escalated: no world met the evidence threshold (best ${result.bestScore}).`, trinity.comparison, result.canMerge ? 'info' : 'warning');
  return result;
}

module.exports = { applyTrinityComparison, buildWorldReports, latestReport };
