'use strict';

const comparativeBarrier = require('./aTeamComparativeBarrier');

async function readDossiers(db, members) {
  return Promise.all(members.map(async (member) => {
    const rows = await db.all(`SELECT payload_json FROM telemetry_events
      WHERE agent_id = ? AND event_type = 'EVIDENCE_REPORT' ORDER BY created_at`, member.workerId);
    const events = rows.map((row) => parseEvidence(row.payload_json)).filter(Boolean).map((report) => ({ payload: { report } }));
    return { workerId: member.workerId, events };
  }));
}

function parseEvidence(serialized) {
  try { return JSON.parse(serialized || '{}'); } catch (_) { return null; }
}

function missingDomains(members, dossiers) {
  const byWorker = new Map(dossiers.map((dossier) => [dossier.workerId, dossier]));
  return members.filter((member) => !byWorker.get(member.workerId)?.events.length).map((member) => member.subSystem);
}

function blockedDecision(reason, missing = []) {
  return { decision: 'blocked', reason, missingDomains: missing };
}

function executionBlock(stageResults, workerWait) {
  const failedStage = stageResults.find((result) => result.blocked);
  if (failedStage) return blockedDecision(failedStage.reason || 'stage_blocked');
  if (!workerWait.timedOut && !workerWait.failedWorkerIds.length) return null;
  return blockedDecision(workerWait.timedOut ? 'worker_timeout' : 'worker_failed');
}

async function arbitrateDossiers(plan, dossiers) {
  const workers = plan.members.map((member) => ({
    agentId: member.workerId, name: member.subSystem, role: member.role,
    subSystem: member.subSystem, pipelineStage: member.pipelineStage
  }));
  const autonomyPlan = { aTeam: { activated: true, members: plan.members } };
  const arbitration = await comparativeBarrier.applyAteamIntegration({
    agentId: plan.orchestratorId, workers, usable: dossiers, autonomyPlan
  });
  return { arbitration, integration: autonomyPlan.aTeam.integration };
}

async function evaluateRuntimeDecision(input) {
  const { db, plan, stageResults, workerWait } = input;
  const executionFailure = executionBlock(stageResults, workerWait);
  if (executionFailure) return executionFailure;

  const dossiers = await readDossiers(db, plan.members);
  const missing = missingDomains(plan.members, dossiers);
  if (missing.length) return blockedDecision('domain_dossier_missing', missing);

  const { arbitration, integration } = await arbitrateDossiers(plan, dossiers);
  if (!integration || integration.canMerge !== true) {
    const failure = integration?.failures?.[0] || integration?.integrationFailures?.[0];
    return {
      ...blockedDecision(failure ? failure.code : 'integration_arbitration_failed'),
      arbitration, integration
    };
  }
  return { decision: 'completed', reason: 'all_domains_verified_and_arbitrated', arbitration, integration };
}

module.exports = { evaluateRuntimeDecision, readDossiers, missingDomains };
