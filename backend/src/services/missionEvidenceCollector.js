'use strict';

const { workerEvidenceDossiers, hasDecisionEvidence } = require('./agentEvidenceService');
const { createEvidenceProfile } = require('./typedEvidenceAlgebraService');
const completionContract = require('./missionCompletionContract');
const completionEvidence = require('./missionCompletionEvidenceService');

// Collects real runtime evidence from worker dossiers, strategy execution
// runs, and telemetry events for a completed mission.
// Returns structured evidence that homeostasis can evaluate against the
// declarative contract's requiredEvidence.

const EVIDENCE_TELEMETRY_EVENTS = new Set([
  'EVIDENCE_REPORT', 'CODE_TEST_SUITE_RECEIPT', 'AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_HALTED',
  'WORKER_EVIDENCE_BARRIER_PARTIAL', 'WORKER_EVIDENCE_BARRIER_SATISFIED',
  'MISSION_HOMEOSTASIS_ACHIEVED', 'HOMEOSTASIS_CONTINUATION_DISPATCHED',
  'MISSION_COMPLETION_BLOCKED',
]);

async function collectMissionEvidence(db, missionId, agents) {
  const identity = await require('./missionIdentityService').get(db, missionId);
  const members = identity ? await require('./missionIdentityService').members(db, missionId) : agents || [];
  const effective = identity ? await require('./regenerationAttemptService').effectiveAgents(db, missionId, members) : members;
  const scope = { missionId, identity };
  const dossiers = collectWorkerDossiers(identity?.orchestratorAgentId || missionId, members);
  const runs = await collectExecutionRuns(db, scope);
  const telemetry = await collectEvidenceTelemetry(db, scope);
  const testExecutionReceipts = await require('./localCodeTestExecutionReceiptService')
    .collectVerifiedForMission(db, missionId, effective);
  const homeostasisState = await collectHomeostasisState(db, missionId);
  const flags = buildEvidenceFlags({ agents: effective, dossiers, telemetry, missionId, testExecutionReceipts });
  const evidence = buildEvidenceKinds({ dossiers, runs, telemetry, homeostasisState, missionId, testExecutionReceipts });
  const profiles = buildTypedProfiles(dossiers, runs);
  const completion = await evaluateCollectedCompletion({ db, missionId,
    orchestratorId: identity?.orchestratorAgentId, agents: effective, dossiers, flags });
  flags.missionOutcome = completion.success;
  flags.completionVerdict = completion.verdict;
  return { flags, evidence, profiles, dossiers, runs, telemetry, testExecutionReceipts, completion };
}

function collectedLifecycle(agents) {
  if (agents.some((agent) => ['error', 'failed', 'apoptosis'].includes(agent.status))) return 'failed';
  if (agents.some((agent) => ['blocked', 'terminated'].includes(agent.status))) return 'interrupted';
  if (agents.length && agents.every((agent) => agent.status === 'completed')) return 'completed';
  return 'running';
}

function collectedTopology(flags) {
  if (!flags.noFailedAgents) return { status: 'failed', reasons: ['required_agent_failed'] };
  if (!flags.allAgentsCompleted) return { status: 'partial', reasons: ['required_agents_incomplete'] };
  return { status: 'verified', reasons: [] };
}

async function evaluateCollectedCompletion(input) {
  const team = await require('./aTeamCompletionEvidenceService')
    .latest(input.db, [input.missionId, input.orchestratorId]);
  if (team) return team.completion;
  const workers = input.agents.filter((agent) => agent.execution_mode === 'worker');
  const required = workers.map((agent) => agent.id);
  const evidence = await completionEvidence.collect({ db: input.db, missionId: input.missionId,
    members: workers.map((worker) => ({ ...worker, memberId: worker.id })),
    evidenceProofs: input.evidenceProofs });
  const completion = completionContract.evaluate({ missionId: input.missionId,
    lifecycleState: collectedLifecycle(input.agents), requiredMemberIds: required,
    members: evidence.members, evidenceProofs: evidence.evidenceProofs,
    barrierStatus: input.barrierStatus ?? 'complete',
    topologyValidation: collectedTopology(input.flags) });
  if (completion.verdict !== 'partial' || !workers.length) return completion;
  return await verifiedDossierCompletion(input, workers) || completion;
}

async function verifiedDossierCompletion(input, workers) {
  const dossiers = await require('./missionDossierOracleVerification').validateDossiers(input.db, input.missionId, input.dossiers);
  const closure = require('./missionClosureDossierAdapter').buildClosureInput({
    missionId: input.missionId, producerId: input.orchestratorId || input.missionId,
    lifecycleState: collectedLifecycle(input.agents),
    barrierStatus: input.barrierStatus ?? 'complete',
    workers: workers.map((worker) => ({ agentId: worker.id, role: worker.role })),
    dossiers
  });
  closure.topologyValidation = collectedTopology(input.flags);
  const rosterVerified = closure.members.length === workers.length
    && closure.members.every((member) => member.status === 'completed'
      && Array.isArray(member.evidenceRefs) && member.evidenceRefs.length > 0);
  closure.invariants = [{ id: 'required_worker_dossiers_verified', passed: rosterVerified }];
  const result = require('./missionClosureService').closeMission(closure);
  return result.success ? result : null;
}

function collectWorkerDossiers(orchestratorId, agents) {
  const workers = agents.filter(a => a.execution_mode === 'worker');
  if (!workers.length) return [];
  const memberIds = new Set(workers.map(worker => worker.id));
  return workerEvidenceDossiers(orchestratorId, workers.map(w => ({ agentId: w.id, name: w.name, role: w.role })))
    .filter(dossier => memberIds.has(dossier.workerId));
}

async function collectExecutionRuns(db, scope) {
  if (!scope.identity) return db.all('SELECT agent_id, status, metrics_json FROM strategy_execution_runs WHERE agent_id = ? ORDER BY created_at', scope.missionId);
  return db.all(`SELECT r.agent_id, r.status, r.metrics_json FROM strategy_execution_runs r
    JOIN mission_agents ma ON ma.agent_id = r.agent_id
    WHERE ma.mission_id = ? AND r.created_at >= ? ORDER BY r.created_at`, scope.missionId, scope.identity.createdAt);
}

async function collectEvidenceTelemetry(db, scope) {
  const types = [...EVIDENCE_TELEMETRY_EVENTS];
  const placeholders = types.map(() => '?').join(',');
  if (!scope.identity) return db.all(`SELECT agent_id, event_type, action, detail, payload_json FROM telemetry_events
    WHERE agent_id = ? AND event_type IN (${placeholders}) ORDER BY created_at LIMIT 1000`, scope.missionId, ...types);
  return db.all(`SELECT t.agent_id, t.event_type, t.action, t.detail, t.payload_json FROM telemetry_events t
    JOIN mission_agents ma ON ma.agent_id = t.agent_id
    WHERE ma.mission_id = ? AND t.created_at >= ? AND t.event_type IN (${placeholders})
    ORDER BY t.created_at LIMIT 1000`, scope.missionId, scope.identity.createdAt, ...types);
}

async function collectHomeostasisState(db, missionId) {
  try {
    return await db.get(`SELECT status FROM homeostasis_states WHERE mission_id = ?
      ORDER BY observed_at DESC, rowid DESC LIMIT 1`, missionId);
  } catch (_) {
    return null;
  }
}

function buildEvidenceFlags({ agents, dossiers, telemetry, missionId, testExecutionReceipts = [] }) {
  const failed = agents.filter(a => ['error', 'failed', 'terminated', 'apoptosis'].includes(a.status)).length;
  const completed = agents.filter(a => a.status === 'completed').length;
  const hasDossierReports = dossiers.some(d => d.events.some(e => e.evidenceReport));
  return {
    missionOutcome: completed > 0 && failed === 0,
    // Only a receipt from the allowlisted sandbox test executor can satisfy this flag.
    testsPassed: require('./codeTestExecutionReceipt').hasPassingSuite(telemetry, missionId)
      || (Array.isArray(testExecutionReceipts) && testExecutionReceipts.length > 0),
    workerEvidenceComplete: hasDossierReports,
    noFailedAgents: failed === 0,
    allAgentsCompleted: completed === agents.length && agents.length > 0,
    // This collector never infers a verifier receipt from reports or telemetry.
    // Ontogenesis may replace false after validating its independent check receipt.
    verifierReceiptPresent: false,
  };
}

function buildEvidenceKinds({ dossiers, runs, telemetry, homeostasisState, missionId, testExecutionReceipts = [] }) {
  const kinds = new Set();
  if (dossiers.some(d => d.events.some(e => e.evidenceReport))) kinds.add('worker_evidence');
  if (runs.some(r => r.status === 'completed')) kinds.add('execution_run_complete');
  if (telemetry.some(hasSubstantiatedEvidenceReport)) kinds.add('evidence_report');
  // A suite claim needs a separate trusted executor receipt, not worker telemetry.
  if (telemetry.some(t => t.event_type === 'WORKER_EVIDENCE_BARRIER_SATISFIED')) kinds.add('worker_evidence_barrier_satisfied');
  if (require('./codeTestExecutionReceipt').hasPassingSuite(telemetry, missionId)) kinds.add('test_suite_passed');
  if (telemetry.some(t => t.event_type === 'AGENT_COMPLETED')) kinds.add('agent_completed');
  if (homeostasisState?.status === 'homeostasis_satisfied') kinds.add('homeostasis_achieved');
  if (Array.isArray(testExecutionReceipts) && testExecutionReceipts.length > 0) kinds.add('test_suite_passed');
  return [...kinds];
}

function hasSubstantiatedEvidenceReport(event) {
  if (event.event_type !== 'EVIDENCE_REPORT') return false;
  let payload;
  try {
    payload = JSON.parse(event.payload_json || '{}');
  } catch (_) {
    return false;
  }
  return hasDecisionEvidence({ eventType: event.event_type, detail: event.detail, payload });
}

function buildTypedProfiles(dossiers, runs) {
  const profiles = [];
  if (dossiers.length > 0) {
    profiles.push(createEvidenceProfile({
      type: 'observational',
      source: 'worker_evidence_dossier',
      properties: { dossierCount: dossiers.length, withReports: dossiers.filter(d => d.events.some(e => e.evidenceReport)).length },
    }));
  }
  const completedRuns = runs.filter(r => r.status === 'completed');
  if (completedRuns.length > 0) {
    profiles.push(createEvidenceProfile({
      type: 'experimental',
      source: 'strategy_execution_run',
      properties: { completedRuns: completedRuns.length, totalRuns: runs.length },
    }));
  }
  return profiles;
}

module.exports = { collectMissionEvidence, evaluateCollectedCompletion, EVIDENCE_TELEMETRY_EVENTS,
  buildEvidenceFlags, buildEvidenceKinds, buildTypedProfiles };
