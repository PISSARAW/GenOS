'use strict';

const { workerEvidenceDossiers } = require('./agentEvidenceService');
const { createEvidenceProfile } = require('./typedEvidenceAlgebraService');

// Collects real runtime evidence from worker dossiers, strategy execution
// runs, and telemetry events for a completed mission.
// Returns structured evidence that homeostasis can evaluate against the
// declarative contract's requiredEvidence.

const EVIDENCE_TELEMETRY_EVENTS = new Set([
  'EVIDENCE_REPORT', 'AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_HALTED',
  'WORKER_EVIDENCE_BARRIER_PARTIAL', 'WORKER_EVIDENCE_BARRIER_SATISFIED',
  'MISSION_HOMEOSTASIS_ACHIEVED', 'HOMEOSTASIS_CONTINUATION_DISPATCHED',
  'MISSION_COMPLETED', 'MISSION_COMPLETION_BLOCKED',
]);

async function collectMissionEvidence(db, missionId, agents) {
  const identity = await require('./missionIdentityService').get(db, missionId);
  const members = identity ? await require('./missionIdentityService').members(db, missionId) : agents || [];
  const effective = identity ? await require('./regenerationAttemptService').effectiveAgents(db, missionId, members) : members;
  const scope = { missionId, identity };
  const dossiers = collectWorkerDossiers(identity?.orchestratorAgentId || missionId, members);
  const runs = await collectExecutionRuns(db, scope);
  const telemetry = await collectEvidenceTelemetry(db, scope);
  const flags = buildEvidenceFlags({ agents: effective, dossiers, telemetry });
  const evidence = buildEvidenceKinds({ dossiers, runs, telemetry });
  const profiles = buildTypedProfiles(dossiers, runs);
  return { flags, evidence, profiles, dossiers, runs, telemetry };
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
  if (!scope.identity) return db.all(`SELECT event_type, action, detail, payload_json FROM telemetry_events
    WHERE agent_id = ? AND event_type IN (${placeholders}) ORDER BY created_at LIMIT 1000`, scope.missionId, ...types);
  return db.all(`SELECT t.event_type, t.action, t.detail, t.payload_json FROM telemetry_events t
    JOIN mission_agents ma ON ma.agent_id = t.agent_id
    WHERE ma.mission_id = ? AND t.created_at >= ? AND t.event_type IN (${placeholders})
    ORDER BY t.created_at LIMIT 1000`, scope.missionId, scope.identity.createdAt, ...types);
}

function buildEvidenceFlags({ agents, dossiers, telemetry }) {
  const failed = agents.filter(a => ['error', 'failed', 'terminated', 'apoptosis'].includes(a.status)).length;
  const completed = agents.filter(a => a.status === 'completed').length;
  const hasDossierReports = dossiers.some(d => d.events.some(e => e.evidenceReport));
  const hasVerifiedBarrier = telemetry.some(t => t.event_type === 'WORKER_EVIDENCE_BARRIER_SATISFIED');
  return {
    missionOutcome: completed > 0 && failed === 0,
    // CRITICAL FIX: WORKER_EVIDENCE_BARRIER_SATISFIED means "all workers terminal
    // and dossiers attached to synthesis" — NOT "tests passed". These are
    // fundamentally different claims. testsPassed should only be true when
    // there is actual test execution evidence (receipt with exitCode 0).
    testsPassed: hasVerifiedBarrier && hasRealTestReceipt(telemetry),
    workerEvidenceComplete: hasDossierReports,
    noFailedAgents: failed === 0,
    allAgentsCompleted: completed === agents.length && agents.length > 0,
    verifierReceiptPresent: telemetry.some(t => t.event_type === 'EVIDENCE_REPORT'),
  };
}

// A real test receipt must contain evidence of actual test execution
// (exit code, suite name, command), not just a barrier satisfaction event.
function hasRealTestReceipt(telemetry) {
  for (const t of telemetry) {
    if (t.event_type !== 'WORKER_EVIDENCE_BARRIER_SATISFIED') continue;
    try {
      const payload = JSON.parse(t.payload_json || '{}');
      // Only count as test_suite_passed if the payload explicitly confirms
      // test execution with exit code 0
      if (payload.exitCode === 0 && payload.suite) return true;
    } catch {
      // ignore parse errors
    }
  }
  return false;
}

function buildEvidenceKinds({ dossiers, runs, telemetry }) {
  const kinds = new Set();
  if (dossiers.some(d => d.events.some(e => e.evidenceReport))) kinds.add('worker_evidence');
  if (runs.some(r => r.status === 'completed')) kinds.add('execution_run_complete');
  if (telemetry.some(t => t.event_type === 'EVIDENCE_REPORT')) kinds.add('evidence_report');
  // CRITICAL FIX: WORKER_EVIDENCE_BARRIER_SATISFIED does NOT imply test_suite_passed.
  // It means "all workers terminal and dossiers attached". Only add test_suite_passed
  // if there is a real test receipt with exitCode 0.
  if (hasRealTestReceipt(telemetry)) kinds.add('test_suite_passed');
  if (telemetry.some(t => t.event_type === 'WORKER_EVIDENCE_BARRIER_SATISFIED')) kinds.add('worker_evidence_barrier_satisfied');
  if (telemetry.some(t => t.event_type === 'AGENT_COMPLETED')) kinds.add('agent_completed');
  if (telemetry.some(t => t.event_type === 'MISSION_COMPLETED')) kinds.add('homeostasis_achieved');
  return [...kinds];
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

module.exports = { collectMissionEvidence, EVIDENCE_TELEMETRY_EVENTS, buildEvidenceFlags, buildEvidenceKinds, buildTypedProfiles };
