'use strict';

const continuity = require('../missionContinuityService');
const { digest } = require('../biologicalIntegrity');
const { summarizeAgents } = require('../orchestratorOutcome');
const { buildMissionContext } = require('../../../bin/orchestratorMissionHelpersBuildContext.cjs');

const TERMINAL = ['completed', 'blocked', 'error', 'terminated', 'apoptosis', 'unverified', 'failed', 'quarantined'];

async function missionAgents(db, id) {
  return db.all(`WITH RECURSIVE family(id) AS (
    SELECT id FROM agents WHERE id = ? UNION SELECT a.id FROM agents a JOIN family f ON a.parent_agent_id = f.id
  ) SELECT a.*, w.path AS workspace_path FROM agents a JOIN family f ON a.id = f.id
    LEFT JOIN workspaces w ON w.id = a.workspace_id`, [id]);
}

function candidateWorkspace(agents, orchestratorId) {
  const candidates = candidateWorkspaces(agents, orchestratorId);
  return candidates.length === 1 ? candidates[0] : null;
}

function candidateWorkspaces(agents, orchestratorId) {
  return [...new Set((agents || []).filter((agent) => agent.id !== orchestratorId
    && agent.execution_mode === 'worker'
    && (agent.status === 'completed' || agent.missionCompletionEvidenceVerified === true)
    && agent.workspace_path).map((agent) => agent.workspace_path))].sort();
}

async function selectVerifiedCandidate(input) {
  const { candidates, missionId, checks, allowExecution, timeoutMs, createReceipt, validateReceipt } = input;
  for (const workspaceRoot of candidates || []) {
    const receipt = await createReceipt({ missionId, workspaceRoot, checks, allowExecution, timeoutMs });
    if (receipt && await validateReceipt(receipt, { missionId, workspaceRoot, checks })) {
      return { candidateWorktree: workspaceRoot, verifierReceipt: receipt };
    }
  }
  return { candidateWorktree: null, verifierReceipt: null };
}

function settled(agents) {
  return agents.length > 0 && agents.every((agent) => !agent.runtime_pid
    && (TERMINAL.includes(agent.status) || agent.missionCompletionEvidenceVerified === true));
}

function parsePayload(event) {
  try { return JSON.parse(event.payload_json || '{}'); } catch (_) { return {}; }
}

function identityReceiptSucceeded(receipt) {
  if (receipt?.success === true) return true;
  try { return JSON.parse(receipt?.result_json || '{}').success === true; } catch (_) { return false; }
}

function validPassingReport(report, { requireDossier = false } = {}) {
  if (!report || report.outcome !== 'success' || !Array.isArray(report.claims) || report.claims.length === 0) return false;
  if (!Array.isArray(report.tests) || report.tests.length === 0
      || report.tests.some((test) => Number(test.exitCode) !== 0 || test.signal)) return false;
  if (!requireDossier) return true;
  const artifact = report.workerArtifact;
  const provenance = artifact?.provenance;
  return artifact?.type === 'dossier' && Array.isArray(artifact.content?.claims)
    && artifact.content.claims.length > 0 && typeof provenance?.source === 'string'
    && provenance.source.length > 0 && typeof provenance.workspaceRoot === 'string'
    && Array.isArray(provenance.sourceRefs) && provenance.sourceRefs.length > 0
    && Array.isArray(report.scopeCompletion?.completedRefs) && report.scopeCompletion.completedRefs.length > 0;
}

async function workerCompletionEvidence(db, agent) {
  if (!agent || agent.execution_mode !== 'worker' || agent.runtime_pid) return false;
  const events = await db.all(`SELECT event_type, payload_json FROM telemetry_events
    WHERE agent_id = ? AND event_type IN ('AGENT_COMPLETED', 'EVIDENCE_REPORT')
    ORDER BY rowid DESC LIMIT 20`, [agent.id]);
  const completions = events.filter((event) => event.event_type === 'AGENT_COMPLETED');
  const reports = events.filter((event) => event.event_type === 'EVIDENCE_REPORT');
  for (const completion of completions) {
    const payload = parsePayload(completion);
    const report = payload.evidenceReport;
    if (!identityReceiptSucceeded(payload.identityReceipt) || !validPassingReport(report, { requireDossier: true })) continue;
    const runId = payload.executionRunId;
    if (!runId || !reports.some((event) => {
      const saved = parsePayload(event);
      return saved.executionRunId === runId && validPassingReport(saved.evidenceReport, { requireDossier: true });
    })) continue;
    return true;
  }
  return false;
}

async function rootCompletionEvidence(db, agent) {
  if (!agent || agent.runtime_pid) return false;
  const events = await db.all(`SELECT event_type, payload_json FROM telemetry_events
    WHERE agent_id = ? AND event_type IN ('AGENT_COMPLETED', 'EVIDENCE_REPORT')
    ORDER BY rowid DESC LIMIT 20`, [agent.id]);
  const reports = events.filter((event) => event.event_type === 'EVIDENCE_REPORT');
  return events.some((event) => {
    if (event.event_type !== 'AGENT_COMPLETED') return false;
    const payload = parsePayload(event);
    const report = payload.evidenceReport;
    return report?.outcome === 'success' && Array.isArray(report.claims) && report.claims.length > 0
      && reports.some((reportEvent) => {
        const evidence = parsePayload(reportEvent);
        const saved = evidence.evidenceReport || evidence;
        return saved.outcome === 'success' && Array.isArray(saved.claims) && saved.claims.length > 0;
      });
  });
}

async function attachCompletionEvidence(db, request, agents) {
  return Promise.all(agents.map(async (agent) => {
    if (agent.runtime_pid) return agent;
    if (agent.execution_mode === 'worker' && agent.status === 'idle'
        && await workerCompletionEvidence(db, agent)) {
      return { ...agent, missionCompletionEvidenceVerified: true };
    }
    if (agent.id === request.id && agent.status === 'unverified'
        && await rootCompletionEvidence(db, agent)) {
      return { ...agent, missionCompletionEvidenceVerified: true };
    }
    return agent;
  }));
}

async function waitForMission(db, request, options) {
  const deadline = Date.now() + request.timeoutMs;
  while (Date.now() < deadline) {
    if (options.stopped()) throw new Error('execution-arretee');
    const agents = await attachCompletionEvidence(db, request, await missionAgents(db, request.id));
    if (settled(agents)) return agents;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('mission-delai-depasse');
}

async function completionGate(db, input) {
  const { request, agents, verifierReceipt = null, candidateWorktree = null } = input;
  const outcome = summarizeAgents(agents);
  if (!Array.isArray(agents) || agents.length === 0) return { allowed: false, reason: 'agents-non-verifies' };
  const root = agents.find((agent) => agent.id === request.id);
  const participants = root ? agents.filter((agent) => agent.id !== request.id) : agents;
  const rootVerified = !root || root.status === 'completed'
    || (root.status === 'unverified' && root.missionCompletionEvidenceVerified === true);
  const participantsVerified = participants.every((agent) => agent?.status === 'completed'
    || agent?.missionCompletionEvidenceVerified === true);
  if (!rootVerified || !participantsVerified) return { allowed: false, reason: 'agents-non-verifies' };
  const context = await buildMissionContext({ db, missionId: request.id, agents, outcome, request, policyRequest: request });
  const verifierReceipts = require('./missionVerifierReceiptService');
  const verifierReceiptPresent = await verifierReceipts.validateReceipt(verifierReceipt, {
    missionId: request.id, workspaceRoot: candidateWorktree || request.workspaceRoot,
    checks: request.verifierChecks
  });
  context.context.flags.verifierReceiptPresent = verifierReceiptPresent;
  if (verifierReceiptPresent) {
    context.context.evidence.push('independent_verifier_receipt');
    if (rootVerified && participantsVerified) {
      const proof = { schema: 'genos.ontogenesis-agent-completion-proof/v1',
        missionId: request.missionId || request.id, orchestratorId: request.id,
        candidateTreeHash: verifierReceipt.treeHash,
        agentIds: agents.map((agent) => agent.id).filter(Boolean).sort(),
        completionVerified: true };
      proof.payloadHash = digest(proof);
      context.context.ontogenesisRuntimeCompletionProof = proof;
    }
  }
  const evidenceGate = verifyEvidenceContract(request, context);
  if (evidenceGate) return evidenceGate;
  const mission = continuity.buildMissionInput(request.id, request.mission, {
    missionId: request.missionId,
    orchestratorAgentId: request.id, completionContract: context.completionContract,
    invariants: context.invariants, safetyConstraints: context.safetyConstraints, context: context.context
  });
  const evaluation = await continuity.evaluateContinuity(db, mission);
  return continuity.transitionMissionToComplete(db, { organism: evaluation.organism, mission, context: context.context });
}

function verifyEvidenceContract(request, context) {
  if (request.requiresEvidenceBeforePromotion === false) return null;
  const verifierReceiptPresent = context.context?.flags?.verifierReceiptPresent === true;
  if (!verifierReceiptPresent) {
    return { allowed: false, reason: 'verifier-receipt-independant-requis' };
  }
  return null;
}

module.exports = { waitForMission, completionGate, missionAgents, settled, verifyEvidenceContract,
  candidateWorkspace, candidateWorkspaces, selectVerifiedCandidate,
  workerCompletionEvidence, rootCompletionEvidence, attachCompletionEvidence };
