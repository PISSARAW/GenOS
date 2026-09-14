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

function reportOf(event) {
  if (!event) return null;
  if (event.evidenceReport) return event.evidenceReport;
  const payload = event.payload || {};
  return payload.evidenceReport || payload.report || null;
}

function latestReport(dossier) {
  const events = Array.isArray(dossier?.events) ? dossier.events : [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const report = reportOf(events[index]);
    if (report) return report;
  }
  const failure = [...events].reverse().find((event) => event && event.failure);
  return failure ? { outcome: 'failed', failure: failure.failure } : null;
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

// Direct path (dispatch_trinity / merge_trinity): the worker evidence lives in
// the durable telemetry stream, not in the orchestrator's in-memory rounds.
async function buildWorldReportsFromMission(db, missionId) {
  const worlds = await db.all(
    `SELECT w.world_number, w.strategy, w.agent_id, w.status FROM trinity_worlds w
     WHERE w.id LIKE ? ESCAPE '\\' OR w.agent_id IN (SELECT id FROM agents WHERE fleet_id = ?)
     ORDER BY w.world_number`,
    `${escapeLike(missionId)}%`, missionId
  );
  const reports = [];
  for (const world of worlds) {
    const rows = await db.all(
      `SELECT payload_json FROM telemetry_events WHERE agent_id = ? AND event_type IN ('EVIDENCE_REPORT','AGENT_COMPLETED') ORDER BY created_at`,
      world.agent_id
    );
    const events = rows.map((row) => {
      let payload = {};
      try { payload = JSON.parse(row.payload_json || '{}'); } catch (_) {}
      return { payload };
    });
    const report = latestReport({ events });
    const normalized = report || {};
    reports.push({
      worldNumber: world.world_number,
      role: world.strategy,
      agentId: world.agent_id,
      outcome: normalized.outcome || 'no_evidence',
      claims: Array.isArray(normalized.claims) ? normalized.claims : [],
      tests: Array.isArray(normalized.tests) ? normalized.tests : [],
      uncertainties: Array.isArray(normalized.uncertainties) ? normalized.uncertainties : [],
      report: report || undefined
    });
  }
  return reports;
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
  trinity.comparison.promotion = await promoteWinner(ctx.db, { missionId: trinity.missionId, orchestratorId: ctx.agentId, result });
  emit(ctx.agentId, 'TRINITY_COMPARATIVE_BARRIER', 'COMPARE_TRINITY', result.canMerge
    ? `Trinity merged World ${result.selectedWorld} (${result.selectedRole}) score=${result.bestScore}.`
    : `Trinity escalated: no world met the evidence threshold (best ${result.bestScore}).`, trinity.comparison, result.canMerge ? 'info' : 'warning');
  return result;
}

async function promoteWinner(db, input = {}) {
  const { missionId, orchestratorId, result } = input;
  if (!result || result.canMerge !== true || !result.selectedWorld) return { promoted: false, reason: 'no_merge' };
  const comparison = result.comparativeAnalysis || {};
  const winner = (comparison.scoredWorlds || []).find((world) => world.worldNumber === result.selectedWorld) || null;
  if (!db || !winner || !winner.agentId) return { promoted: false, reason: 'no_winner_agent' };
  await db.run("UPDATE trinity_worlds SET status = 'promoted', updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?", winner.agentId).catch(() => {});
  for (const world of comparison.scoredWorlds || []) {
    if (world.worldNumber === result.selectedWorld || !world.agentId) continue;
    await db.run("UPDATE trinity_worlds SET status = CASE WHEN status = 'promoted' THEN status ELSE 'compared' END, updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?", world.agentId).catch(() => {});
  }
  emit(orchestratorId, 'TRINITY_WINNER_PROMOTED', 'PROMOTE_TRINITY', `Promoted World ${result.selectedWorld} (${result.selectedRole}) score=${result.bestScore}.`, { missionId, worldNumber: result.selectedWorld, role: result.selectedRole, score: result.bestScore }, 'info');
  return { promoted: true, worldNumber: result.selectedWorld, role: result.selectedRole, score: result.bestScore, agentId: winner.agentId };
}

module.exports = { applyTrinityComparison, buildWorldReports, buildWorldReportsFromMission, latestReport, promoteWinner };
