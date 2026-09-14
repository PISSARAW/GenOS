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
const { observeAteamIntegration } = require('./aTeamIntegrationObserver');
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

// Observable facts for every A-Team fusion, as promised by the docs.
function buildAteamMetrics({ aTeam, workers, observation, arbitration, canMerge }) {
  const members = Array.isArray(aTeam.members) ? aTeam.members : [];
  const coverage = aTeam.capabilityCoverage;
  return {
    analysisFit: coverage ? Number(coverage.ratio) : (aTeam.recommended === true ? 1 : 0),
    memberActivationOrder: members.map((member) => member.label || member.subSystem || member.role).filter(Boolean),
    memberCount: (Array.isArray(workers) ? workers : members).length,
    fusionDecision: canMerge ? 'merged' : 'escalated',
    integrationConstraintViolations: observation.failures.length + observation.integrationFailures.length,
    continuationRounds: Number(aTeam.continuationRounds) || 0,
    paretoFrontCount: Number(arbitration.paretoFrontCount || 0),
    totalEvaluated: Number(arbitration.totalEvaluated || 0)
  };
}

async function applyAteamIntegration(ctx) {
  const aTeam = ctx && ctx.autonomyPlan ? ctx.autonomyPlan.aTeam : null;
  if (!aTeam || aTeam.activated !== true) return null;
  const dossiers = ctx.usable || workerEvidenceDossiers(ctx.agentId, ctx.workers || []);
  const candidates = buildDossiers(ctx.workers || [], dossiers);
  const arbitration = coordination.arbitrateIntegration(candidates);
  const observation = observeAteamIntegration({ members: aTeam.members, workers: ctx.workers || [], dossiers });
  const canMerge = mergeDecision(arbitration)
    && observation.failures.length === 0
    && observation.integrationFailures.length === 0;
  aTeam.integration = {
    canMerge,
    totalEvaluated: arbitration.totalEvaluated,
    paretoFrontCount: arbitration.paretoFrontCount,
    kneePoint: arbitration.kneePoint,
    leaderboard: arbitration.leaderboard,
    failures: observation.failures,
    integrationFailures: observation.integrationFailures,
    observerReport: observation.observerReport
  };
  const leader = arbitration.kneePoint;
  const blocking = observation.failures[0] || observation.integrationFailures[0];
  const detail = canMerge
    ? `A-Team integration arbitrated; knee-point candidate '${leader?.candidateId || leader?.name || 'unknown'}' leads the Pareto front.`
    : (blocking ? `A-Team integration blocked (${blocking.code}): ${blocking.message}` : 'A-Team integration arbitrated but no scored candidate could be promoted.');
  emit(ctx.agentId, 'A_TEAM_INTEGRATION_ARBITRATED', 'ARBITRATE_INTEGRATION', detail, aTeam.integration, canMerge ? 'info' : 'warning');
  aTeam.metrics = buildAteamMetrics({ aTeam, workers: ctx.workers || [], observation, arbitration, canMerge });
  emit(ctx.agentId, 'A_TEAM_METRICS', 'OBSERVE', `A-Team fusion=${aTeam.metrics.fusionDecision}, violations=${aTeam.metrics.integrationConstraintViolations}.`, aTeam.metrics, 'info');
  return arbitration;
}

module.exports = { applyAteamIntegration, buildDossiers, mergeDecision, buildAteamMetrics };
