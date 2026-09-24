'use strict';

/**
 * @file aTeamComparativeBarrier.js
 * @description Gates A-Team integration on domain coverage, validated worker
 * evidence, satisfied dependency handoffs and an impartial observer report.
 */
const { workerEvidenceDossiers } = require('./agentEvidenceService');
const { latestReport } = require('./trinityComparativeBarrier');
const { observeAteamIntegration } = require('./aTeamIntegrationObserver');
const { reportIsUsable } = require('./aTeamHandoffEvidenceService');
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

function workerForMember(member, workers) {
  return workers.find((worker) => worker.agentId === member.agentId || worker.agentId === member.workerId
    || worker.label === member.label || worker.subSystem === member.subSystem || worker.role === member.role);
}

function coverageFailures(aTeam, workers, dossiers) {
  const failures = [];
  const members = Array.isArray(aTeam.members) ? aTeam.members : [];
  const byDossier = new Map((dossiers || []).map((dossier) => [dossier.workerId, dossier]));
  for (const member of members) {
    const worker = workerForMember(member, workers);
    if (!worker) {
      failures.push({ code: 'ATEAM_DOMAIN_UNCOVERED', domain: member.label || member.subSystem || member.role, message: 'A-Team member has no launched worker.' });
      continue;
    }
    const dossier = byDossier.get(worker.agentId);
    const report = latestReport(dossier);
    const required = member.requiredArtifacts || member.outputs || worker.requiredArtifacts || worker.outputs || [];
    if (!reportIsUsable(report, required)) {
      failures.push({ code: 'ATEAM_EVIDENCE_UNAVAILABLE', workerId: worker.agentId, message: `Worker '${worker.agentId}' has no successful evidence report satisfying its artifact contract.` });
    }
  }
  const ratio = aTeam.capabilityCoverage && Number(aTeam.capabilityCoverage.ratio);
  if (Number.isFinite(ratio) && ratio < 1) {
    failures.push({ code: 'ATEAM_CAPABILITY_COVERAGE_INCOMPLETE', message: 'Required A-Team capability coverage is incomplete.' });
  }
  return failures;
}

function activationOrder(members) {
  return members.map((member) => member.label || member.subSystem || member.role).filter(Boolean);
}

function buildAteamMetrics({ aTeam, workers, observation, canMerge }) {
  const members = Array.isArray(aTeam.members) ? aTeam.members : [];
  const coverage = aTeam.capabilityCoverage;
  return {
    analysisFit: coverage ? Number(coverage.ratio) : (aTeam.recommended === true ? 1 : 0),
    memberActivationOrder: activationOrder(members),
    memberCount: (Array.isArray(workers) ? workers : members).length,
    fusionDecision: canMerge ? 'merged' : 'escalated',
    integrationConstraintViolations: observation.failures.length + observation.integrationFailures.length,
    continuationRounds: Number(aTeam.continuationRounds) || 0,
    paretoFrontCount: 0,
    totalEvaluated: 0
  };
}

async function applyAteamIntegration(ctx) {
  const aTeam = ctx && ctx.autonomyPlan ? ctx.autonomyPlan.aTeam : null;
  if (!aTeam || aTeam.activated !== true) return null;
  const workers = ctx.workers || [];
  const dossiers = ctx.usable || workerEvidenceDossiers(ctx.agentId, workers);
  const observation = observeAteamIntegration({ members: aTeam.members, workers, dossiers });
  const evidenceFailures = coverageFailures(aTeam, workers, dossiers);
  const failures = [...evidenceFailures, ...observation.failures];
  const canMerge = failures.length === 0 && observation.integrationFailures.length === 0;
  aTeam.integration = {
    canMerge,
    totalEvaluated: 0,
    paretoFrontCount: 0,
    paretoScope: 'domain_local_alternatives_only',
    failures,
    integrationFailures: observation.integrationFailures,
    observerReport: observation.observerReport
  };
  const blocking = failures[0] || observation.integrationFailures[0];
  const detail = canMerge
    ? 'A-Team integration accepted: required domains, evidence handoffs and integration constraints are satisfied.'
    : `A-Team integration blocked (${blocking.code}): ${blocking.message}`;
  emit(ctx.agentId, 'A_TEAM_INTEGRATION_ARBITRATED', 'VALIDATE_INTEGRATION', detail, aTeam.integration, canMerge ? 'info' : 'warning');
  aTeam.metrics = buildAteamMetrics({ aTeam, workers, observation, canMerge });
  emit(ctx.agentId, 'A_TEAM_METRICS', 'OBSERVE', `A-Team fusion=${aTeam.metrics.fusionDecision}, violations=${aTeam.metrics.integrationConstraintViolations + failures.length}.`, aTeam.metrics, 'info');
  return { canMerge, failures, integrationFailures: observation.integrationFailures, paretoFront: [], totalEvaluated: 0 };
}

module.exports = { applyAteamIntegration, buildDossiers, buildAteamMetrics };
