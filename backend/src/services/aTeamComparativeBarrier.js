'use strict';

/**
 * @file aTeamComparativeBarrier.js
 * @description Integration arbitration for the A-Team. It turns the domain
 * worker dossiers into arena candidates, ranks them with the Pareto/Elo model
 * and exposes the merge decision on the autonomy plan, mirroring the Trinity
 * comparative barrier. Without this step the A-Team produced dossiers but never
 * arbitrated them.
 */
const coordination = require('./aTeamCoordinationService');
const { workerEvidenceDossiers } = require('./agentEvidenceService');
const { latestReport } = require('./trinityComparativeBarrier');
const { emit } = require('./agentOrchestrationState');

function dossierFor(worker, dossier) {
  const events = Array.isArray(dossier?.events) ? dossier.events : [];
  const report = latestReport(dossier) || {};
  return {
    workerId: worker.agentId,
    name: worker.name || null,
    role: worker.role || worker.label || null,
    subSystem: worker.subSystem || worker.label || null,
    pipelineStage: Number(worker.pipelineStage) || 0,
    outcome: report.outcome || 'no_evidence',
    evidenceReport: report,
    events
  };
}

function buildDossiers(workers, dossiers) {
  const byWorker = new Map((dossiers || []).map((dossier) => [dossier.workerId, dossier]));
  return (workers || []).map((worker) => dossierFor(worker, byWorker.get(worker.agentId)));
}

function mergeDecision(arbitration) {
  const scored = Number(arbitration?.totalEvaluated || 0);
  const front = Array.isArray(arbitration?.paretoFront) ? arbitration.paretoFront : [];
  return scored > 0 && front.length > 0 && Boolean(arbitration?.kneePoint);
}

async function applyAteamIntegration(ctx) {
  const aTeam = ctx && ctx.autonomyPlan ? ctx.autonomyPlan.aTeam : null;
  if (!aTeam || aTeam.activated !== true) return null;
  const dossiers = ctx.usable || workerEvidenceDossiers(ctx.agentId, ctx.workers || []);
  const candidates = buildDossiers(ctx.workers || [], dossiers);
  const arbitration = coordination.arbitrateIntegration(candidates);
  const canMerge = mergeDecision(arbitration);
  aTeam.integration = {
    canMerge,
    totalEvaluated: arbitration.totalEvaluated,
    paretoFrontCount: arbitration.paretoFrontCount,
    kneePoint: arbitration.kneePoint,
    leaderboard: arbitration.leaderboard
  };
  const leader = arbitration.kneePoint;
  emit(ctx.agentId, 'A_TEAM_INTEGRATION_ARBITRATED', 'ARBITRATE_INTEGRATION', canMerge
    ? `A-Team integration arbitrated; knee-point candidate '${leader?.candidateId || leader?.name || 'unknown'}' leads the Pareto front.`
    : 'A-Team integration arbitrated but no scored candidate could be promoted.', aTeam.integration, canMerge ? 'info' : 'warning');
  return arbitration;
}

module.exports = { applyAteamIntegration, buildDossiers, mergeDecision };
