'use strict';

/**
 * @file aTeamComparativeBarrier.js
 * @description Gates A-Team integration on domain coverage, validated worker
 * evidence, satisfied dependency handoffs and an impartial observer report.
 */
const { workerEvidenceDossiers } = require('./agentEvidenceService');
const { latestReport } = require('./trinityComparativeBarrier');
const continuousIntegration = require('./aTeam/integration/continuousIntegrationService');
const { reportIsUsable } = require('./aTeamHandoffEvidenceService');
const { emit } = require('./agentOrchestrationState');
const { usableEvidenceReferences } = require('./aTeamHandoffEvidenceService');
const teamRunStore = require('./aTeam/teamRunStore');
const aTeamRuntime = require('./aTeam/aTeamRuntime');
const teamLearning = require('./aTeam/learning/teamLearningService');

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
  failures.push(...members.map((member) => memberCoverageFailure(member, { workers, byDossier })).filter(Boolean));
  const ratio = aTeam.capabilityCoverage && Number(aTeam.capabilityCoverage.ratio);
  if (Number.isFinite(ratio) && ratio < 1) {
    failures.push({ code: 'ATEAM_CAPABILITY_COVERAGE_INCOMPLETE', message: 'Required A-Team capability coverage is incomplete.' });
  }
  return failures;
}

function memberCoverageFailure(member, context) {
  const worker = workerForMember(member, context.workers);
  if (!worker) return { code: 'ATEAM_DOMAIN_UNCOVERED', domain: member.label || member.subSystem || member.role, message: 'A-Team member has no launched worker.' };
  const report = latestReport(context.byDossier.get(worker.agentId));
  const required = member.requiredArtifacts?.length ? member.requiredArtifacts : (member.outputs || worker.outputs || []);
  if (reportIsUsable(report, required)) return null;
  return { code: 'ATEAM_EVIDENCE_UNAVAILABLE', workerId: worker.agentId, message: 'Worker has no successful evidence report satisfying its artifact contract.' };
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
  const aTeam = ctx?.autonomyPlan?.aTeam || null;
  if (!aTeam || aTeam.activated !== true) return null;
  const workers = ctx.workers || [];
  const dossiers = ctx.usable || workerEvidenceDossiers(ctx.agentId, workers);
  const canonical = await refreshCanonicalEvidence(ctx, aTeam);
  const evidenceFailures = coverageFailures(aTeam, workers, dossiers);
  if (canonical && !canonical.promoted) evidenceFailures.push({ code: "ATEAM_WORK_GRAPH_UNPROMOTED", message: "One or more canonical work nodes have not been promoted." });
  const integration = await continuousIntegration.runContinuousIntegration({
    db: ctx.db, aTeam, workers, dossiers, failures: evidenceFailures,
    findExperts: ctx.findAteamExperts, freshness: ctx.knowledgeFreshness
  });
  const observation = integration.observation;
  const failures = integration.blockingFailures;
  const canMerge = integration.readyToIntegrate;
  aTeam.integration = {
    canMerge,
    readyToIntegrate: integration.readyToIntegrate,
    warnings: integration.warnings,
    integrationGraphHealth: integration.integrationGraphHealth,
    uncoveredCapabilities: integration.uncoveredCapabilities,
    unresolvedContracts: integration.unresolvedContracts,
    totalEvaluated: 0,
    paretoFrontCount: 0,
    paretoScope: 'domain_local_alternatives_only',
    failures,
    integrationFailures: observation.integrationFailures,
    observerReport: observation.observerReport
  };
  emitIntegration(ctx.agentId, aTeam.integration, observation);
  aTeam.metrics = buildAteamMetrics({ aTeam, workers, observation, canMerge });
  emit(ctx.agentId, 'A_TEAM_METRICS', 'OBSERVE', `A-Team fusion=${aTeam.metrics.fusionDecision}, violations=${aTeam.metrics.integrationConstraintViolations + failures.length}.`, aTeam.metrics, 'info');
  if (canMerge) await persistSuccessfulLearning({ ...ctx, aTeam, dossiers });
  return { canMerge, failures, integrationFailures: observation.integrationFailures, paretoFront: [], totalEvaluated: 0 };
}

function emitIntegration(agentId, integration, observation) {
  const blocking = integration.failures[0] || observation.integrationFailures[0] || { code: 'ATEAM_UNRESOLVED_CONTRACT', message: 'A blocking handoff or interface contract remains unresolved.' };
  const detail = integration.canMerge ? 'A-Team integration accepted: domains, evidence handoffs and constraints are satisfied.'
    : 'A-Team integration blocked (' + blocking.code + '): ' + blocking.message;
  emit(agentId, 'A_TEAM_INTEGRATION_ARBITRATED', 'VALIDATE_INTEGRATION', detail, integration, integration.canMerge ? 'info' : 'warning');
}

async function refreshCanonicalEvidence(ctx, aTeam) {
  if (!ctx.db || !aTeam.teamRun?.teamRunId) return null;
  const run = await teamRunStore.load(ctx.db, aTeam.teamRun.teamRunId);
  if (!run) throw Object.assign(new Error('Canonical A-Team run is missing.'), { code: 'ATEAM_RUN_UNKNOWN' });
  const scheduler = require('./aTeamStageScheduler');
  const plan = scheduler.stagePlanFor({ orchestratorId: run.missionId, planId: run.teamRunId, members: run.members });
  const { observeExecution } = require('./aTeam/execution/workGraphExecutionService');
  const observed = await observeExecution({ db: ctx.db, run, plan });
  aTeam.members = run.members;
  aTeam.workGraph = observed.graph;
  aTeam.capabilityCoverage = observed.coverage;
  return observed;
}

async function persistSuccessfulLearning({ db, agentId, aTeam, dossiers }) {
  const draft = aTeam.teamRun;
  if (!db || !draft?.teamRunId) return;
  try {
    const run = await teamRunStore.load(db, draft.teamRunId);
    if (run.status === 'RUNNING') {
      const completed = await aTeamRuntime.transitionRun({
        db, teamRunId: run.teamRunId, revision: run.revision,
        patch: { status: 'COMPLETED', phase: 'INTEGRATION' }
      });
      aTeam.teamRun = await aTeamRuntime.transitionRun({ db, teamRunId: completed.teamRunId, revision: completed.revision, patch: { phase: 'DEBRIEF' } });
    }
    await persistDebrief({ db, agentId, aTeam, dossiers });
  } catch (error) {
    emit(agentId, 'A_TEAM_LEARNING_PERSISTENCE_FAILED', 'DEBRIEF', error.message, { teamRunId: draft.teamRunId, code: error.code || 'ATEAM_LEARNING_FAILED' }, 'warning');
  }
}

async function persistDebrief({ db, aTeam, dossiers }) {
  const reports = (dossiers || []).map((dossier) => ({ dossier, report: latestReport(dossier) || {} }));
  const evidenceIds = [...new Set(reports.flatMap(({ report }) => usableEvidenceReferences(report)))];
  const memberOutcomes = Object.fromEntries(reports.map(({ dossier, report }) => [dossier.workerId, {
    successRate: 1, evidenceId: usableEvidenceReferences(report)[0]
  }]).filter(([, outcome]) => outcome.evidenceId));
  const validEvidence = new Set(evidenceIds);
  await teamLearning.persistTeamDebrief({
    db, teamRunId: aTeam.teamRun.teamRunId, taskProfile: aTeam.primaryDomain || aTeam.organization,
    objectiveMet: true, evidenceIds, memberOutcomes,
    metrics: { completionRate: 1, reworkRate: 0, handoffAcceptanceRate: 1 },
    evidenceIsUsable: async ({ evidenceId }) => validEvidence.has(evidenceId)
  });
}

module.exports = { applyAteamIntegration, buildDossiers, buildAteamMetrics, persistSuccessfulLearning };
