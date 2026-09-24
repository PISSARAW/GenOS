'use strict';

/**
 * @file trinityComparativeBarrier.js
 * @description Comparative evidence barrier for Trinity. It turns the three
 * worlds' real worker dossiers into world reports, scores them with the
 * domain-weighted model, records the comparison and exposes the
 * merge/escalation decision on the autonomy plan.
 */
const trinityService = require('./trinityService');
const crypto = require('crypto');
const trinityExperimentStore = require('./trinityExperimentStore');
const workspaceLifecycle = require('./agentWorkspaceLifecycleService');
const { hashWorkspace } = require('./trinitySnapshotService');
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

function worldReportFor(params) {
  const { worker, member, byWorker, index } = params;
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
}

function buildWorldReports(workers, dossiers, options = {}) {
  const byWorker = new Map((dossiers || []).map((dossier) => [dossier.workerId, dossier]));
  const members = Array.isArray(options.members) ? options.members : [];
  return (workers || []).map((worker, index) => worldReportFor({ worker, member: members[index] || {}, byWorker, index }));
}

function buildComparison(result) {
  return {
    canMerge: result.canMerge,
    outcome: result.outcome,
    reason: result.reason || null,
    selectedWorld: result.selectedWorld,
    selectedRole: result.selectedRole || null,
    bestScore: result.bestScore,
    paretoFrontier: result.comparativeAnalysis?.pareto?.frontier?.map((world) => world.worldNumber) || [],
    tied: result.comparativeAnalysis?.tied === true
  };
}

async function recordComparison(ctx, trinity, result) {
  await trinityService.recordWorldComparison(ctx.db, {
    missionId: trinity.missionId,
    orchestratorId: ctx.agentId,
    comparison: result.comparativeAnalysis,
    decision: { canMerge: result.canMerge, outcome: result.outcome }
  });
}

async function applyTrinityComparison(ctx) {
  const trinity = ctx && ctx.autonomyPlan ? ctx.autonomyPlan.trinity : null;
  if (!trinity || trinity.activated !== true) return null;
  const threshold = Number(trinity.threshold) || 0.70;
  const dossiers = ctx.usable || workerEvidenceDossiers(ctx.agentId, ctx.workers || []);
  const worldReports = buildWorldReports(ctx.workers || [], dossiers, { members: trinity.members || [] });
  const result = trinityService.mergeTrinityEvidence(worldReports, { domain: trinity.domain, threshold });
  await recordComparison(ctx, trinity, result);
  trinity.comparison = buildComparison(result);
  trinity.comparison.promotion = await promoteWinner(ctx.db, { missionId: trinity.missionId, orchestratorId: ctx.agentId, result });
  emitComparison(ctx, trinity, result);
  return result;
}

function emitComparison(ctx, trinity, result) {
  const detail = result.canMerge
    ? `Trinity selected World ${result.selectedWorld} (${result.selectedRole}) as a candidate; promotion checks are still pending.`
    : `Trinity decision ${result.outcome || 'ESCALATE_EXPERIMENT'}: ${result.reason || 'no unique verified Pareto winner'}.`;
  emit(ctx.agentId, 'TRINITY_COMPARATIVE_BARRIER', 'COMPARE_TRINITY', detail, trinity.comparison, result.canMerge ? 'info' : 'warning');
}

function validateMergeInput(db, result) {
  if (!result || result.canMerge !== true || !result.selectedWorld) return { valid: false, reason: 'no_merge' };
  const comparison = result.comparativeAnalysis || {};
  const winner = (comparison.scoredWorlds || []).find((w) => w.worldNumber === result.selectedWorld);
  if (!db || !winner || !winner.agentId) return { valid: false, reason: 'no_winner_agent' };
  return { valid: true, winner };
}

async function loadMergeContext(db, winner) {
  const winnerAgent = await db.get("SELECT workspace_id, id, name FROM agents WHERE id = ?", winner.agentId);
  const workspace = await db.get('SELECT * FROM workspaces WHERE id = ?', winnerAgent?.workspace_id);
  const world = await db.get('SELECT workspace_root FROM trinity_worlds WHERE agent_id = ?', winner.agentId);
  return { winnerAgent, workspace, sourcePath: world?.workspace_root || workspace?.path };
}

async function updateWorldStatuses(db, result, winner) {
  await db.run("UPDATE trinity_worlds SET status = 'candidate', updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?", winner.agentId);
  const scored = result.comparativeAnalysis?.scoredWorlds || [];
  for (const world of scored) {
    if (world.worldNumber === result.selectedWorld || !world.agentId) continue;
    await db.run("UPDATE trinity_worlds SET status = 'compared', updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?", world.agentId);
  }
}

async function createMergeArtifact(db, params) {
  const { result, context, orchestratorId } = params;
  const { winnerAgent, workspace: winnerWorkspace, sourcePath } = context;
  if (!winnerAgent?.workspace_id || !winnerWorkspace?.path || !sourcePath) return null;
  try {
    const sourceDir = sourcePath;
    const candidateId = `trinity_candidate_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const targetDir = await workspaceLifecycle.createIsolatedWorkspace(sourceDir, candidateId);
    let contentHash;
    try {
      contentHash = await hashWorkspace(targetDir);
      if (contentHash !== await hashWorkspace(sourceDir)) {
        await workspaceLifecycle.cleanupWorkspace(targetDir).catch(() => {});
        throw Object.assign(new Error('Trinity candidate differs from the selected world.'), { code: 'TRINITY_CANDIDATE_HASH_MISMATCH' });
      }
    } catch (error) {
      await workspaceLifecycle.cleanupWorkspace(targetDir).catch(() => {});
      throw error;
    }
    const candidateWorkspaceId = `trinity_candidate_${crypto.randomBytes(8).toString('hex')}`;
    await db.run(
      `INSERT INTO workspaces (id, name, path, visibility, language, description, tags, organization_id, project_id)
       VALUES (?, ?, ?, 'Private', ?, ?, '[]', ?, ?)`,
      candidateWorkspaceId, `Trinity candidate World ${result.selectedWorld}`, targetDir,
      winnerWorkspace.language || 'Mixed', `Candidate artifact for Trinity world ${result.selectedWorld}.`,
      winnerWorkspace.organization_id || null, winnerWorkspace.project_id || null
    );
    const artifact = { sourceWorkspace: sourceDir, targetWorkspace: targetDir, candidateWorkspaceId, contentHash, worldNumber: result.selectedWorld, role: result.selectedRole, status: 'candidate' };
    emit(orchestratorId, 'TRINITY_MERGE_ARTIFACT_CREATED', 'MERGE', `Created isolated candidate artifact from World ${result.selectedWorld} (${result.selectedRole}).`, artifact, 'info');
    return artifact;
  } catch (mergeError) {
    emit(orchestratorId, 'TRINITY_MERGE_ARTIFACT_FAILED', 'MERGE', `Failed to create merge artifact from World ${result.selectedWorld}: ${mergeError.message}`, { error: mergeError.message }, 'error');
    return null;
  }
}

async function promoteWinner(db, input = {}) {
  const { missionId, orchestratorId, result } = input;
  const previous = await previousPromotion({ db, missionId });
  if (previous) return previous;
  await updateExperimentDecision(db, missionId, result);
  const validation = validateMergeInput(db, result);
  if (!validation.valid) {
    await failPromotion({ db, missionId, reason: validation.reason });
    return { promoted: false, reason: validation.reason };
  }
  const { winner } = validation;
  const context = await loadMergeContext(db, winner);
  const artifact = await createMergeArtifact(db, { result, context, orchestratorId });
  if (!artifact) {
    await failPromotion({ db, missionId, reason: 'candidate_artifact_creation_failed' });
    return { promoted: false, reason: 'candidate_artifact_creation_failed' };
  }
  try {
    const verification = await verifyCandidate(db, { missionId, winner, artifact });
    const experiment = await db.get('SELECT id FROM trinity_experiments WHERE mission_id = ?', missionId);
    if (!experiment) throw new Error('Trinity experiment disappeared before final promotion.');
    const decision = { outcome: 'PROMOTED', worldNumber: result.selectedWorld, artifact, verification };
    const git = require('./agentGitService');
    const gitRequest = { user: { username: 'trinity-runtime' }, body: {} };
    const commit = await git.createCommit(gitRequest, {
      agentId: winner.agentId,
      refName: `trinity/${experiment.id}`,
      metadata: { experimentId: experiment.id, worldNumber: result.selectedWorld, contentHash: verification.contentHash, candidateWorkspaceId: artifact.candidateWorkspaceId, integrationChecks: verification.integrationChecks, claimChecks: verification.claimChecks }
    });
    const stored = await git.getObject(db, gitRequest, commit.id);
    if (!stored || !git.verifyObjectSignature(stored)) throw new Error('AgentGit candidate reference signature is invalid.');
    decision.agentGit = { objectId: commit.id, refName: commit.refName, commitHash: commit.commitHash, stateHash: commit.stateHash };
    const { withTransaction } = require('../db');
    await withTransaction(db, async (tx) => {
      await updateWorldStatuses(tx, result, winner);
      await tx.run("UPDATE trinity_worlds SET status = 'promoted', updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?", winner.agentId);
      await trinityExperimentStore.transition(tx, {
        id: experiment.id, status: 'promoted', decision,
        reason: 'candidate_checks_hash_and_agent_git_verified', evidenceRef: commit.id
      });
    });
    artifact.status = 'promoted';
    emit(orchestratorId, 'TRINITY_WINNER_SELECTED', 'SELECT_TRINITY', `Promoted verified candidate from World ${result.selectedWorld} (${result.selectedRole}).`, { missionId, worldNumber: result.selectedWorld, role: result.selectedRole, artifact, verification, agentGit: decision.agentGit }, 'info');
    return { promoted: true, worldNumber: result.selectedWorld, role: result.selectedRole, score: result.bestScore, agentId: winner.agentId, artifact, verification, agentGit: decision.agentGit };
  } catch (error) {
    await failPromotion({ db, missionId, reason: error.code || 'candidate_verification_failed', artifact: { ...artifact, failure: error.message } });
    emit(orchestratorId, 'TRINITY_PROMOTION_FAILED', 'PROMOTE_TRINITY', `Candidate promotion failed: ${error.message}`, { missionId, artifact }, 'error');
    return { promoted: false, candidateCreated: true, reason: error.code || 'candidate_verification_failed', artifact };
  }
}

async function previousPromotion(input) {
  const { db, missionId } = input;
  if (!missionId) return null;
  const experiment = await db.get('SELECT status, decision_json, failure_reason FROM trinity_experiments WHERE mission_id = ?', missionId);
  if (!experiment || !['promoted', 'promotion_failed'].includes(experiment.status)) return null;
  let decision = {};
  try { decision = JSON.parse(experiment.decision_json || '{}'); } catch (_) {}
  return {
    promoted: experiment.status === 'promoted',
    idempotent: true,
    reason: decision.reason || experiment.failure_reason || null,
    worldNumber: decision.worldNumber,
    artifact: decision.artifact || decision.candidateArtifact || null,
    verification: decision.verification || null,
    agentGit: decision.agentGit || null
  };
}

async function verifyCandidate(db, input) {
  const { missionId, winner, artifact } = input;
  const row = await db.get('SELECT design_json FROM trinity_experiments WHERE mission_id = ?', missionId);
  const design = JSON.parse(row?.design_json || '{}');
  const required = Array.isArray(design.integrationChecks) ? design.integrationChecks : [];
  if (!required.length) throw Object.assign(new Error('No integration checks were configured.'), { code: 'TRINITY_INTEGRATION_CHECKS_REQUIRED' });
  const diagnostics = require('./workspaceDiagnosticsService');
  const available = await diagnostics.inspectWorkspace(artifact.candidateWorkspaceId);
  const commands = new Set(available.testCommands.map((command) => command.id));
  if (required.some((id) => !commands.has(id))) throw Object.assign(new Error('A configured integration check is unavailable in the candidate.'), { code: 'TRINITY_INTEGRATION_CHECK_UNAVAILABLE' });
  const integrationChecks = [];
  for (const commandId of required) {
    const receipt = await diagnostics.runWorkspaceTest(artifact.candidateWorkspaceId, commandId);
    integrationChecks.push(commandReceipt(receipt, { commandId }));
    if (receipt.exitCode !== 0 || receipt.signal) throw Object.assign(new Error(`Integration check failed: ${commandId}`), { code: 'TRINITY_INTEGRATION_CHECK_FAILED' });
  }
  const claims = Array.isArray(winner.report?.claims) ? winner.report.claims : [];
  const claimChecks = await verifyClaimChecks({ claims, plans: design.claimVerificationChecks, commands, diagnostics, workspaceId: artifact.candidateWorkspaceId });
  const contentHash = await hashWorkspace(artifact.targetWorkspace);
  if (contentHash !== artifact.contentHash) throw Object.assign(new Error('Candidate changed during verification.'), { code: 'TRINITY_CANDIDATE_HASH_CHANGED' });
  return { contentHash, integrationChecks, claimChecks, claimsCoveredByChecks: true, sourceAgentId: winner.agentId };
}

function claimCommandIds(claim, plans, availableCommands) {
  const claimKey = String(claim?.id || claim?.statement || claim || '').trim();
  const commandIds = new Map((Array.isArray(plans) ? plans : []).map((plan) => [plan.claim, plan.commandIds])).get(claimKey) || [];
  if (!commandIds.length || commandIds.some((id) => !availableCommands.has(id))) {
    throw Object.assign(new Error(`Claim lacks an available verification command: ${claimKey}`), { code: 'TRINITY_CLAIM_VERIFICATION_REQUIRED' });
  }
  return { claimKey, commandIds };
}

async function runClaimCommand(input) {
  const { claimKey, commandId, diagnostics, workspaceId } = input;
  const result = await diagnostics.runWorkspaceTest(workspaceId, commandId);
  const receipt = commandReceipt(result, { claim: claimKey, commandId });
  if (!receipt.passed) throw Object.assign(new Error(`Claim verification failed: ${claimKey} (${commandId})`), { code: 'TRINITY_CLAIM_VERIFICATION_FAILED' });
  return receipt;
}

function outputHash(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function commandReceipt(result, context) {
  return {
    ...context,
    command: result.command,
    exitCode: result.exitCode,
    signal: result.signal || null,
    durationMs: result.durationMs,
    stdoutHash: outputHash(result.stdout),
    stderrHash: outputHash(result.stderr),
    passed: result.exitCode === 0 && !result.signal
  };
}

async function verifyClaimChecks(input) {
  const { claims, plans, commands, diagnostics, workspaceId } = input;
  if (!claims.length) return [];
  const receipts = [];
  for (const claim of claims) {
    const plan = claimCommandIds(claim, plans, commands);
    for (const commandId of plan.commandIds) {
      receipts.push(await runClaimCommand({ claimKey: plan.claimKey, commandId, diagnostics, workspaceId }));
    }
  }
  return receipts;
}

async function updateExperimentDecision(db, missionId, result) {
  if (!missionId) return;
  const experiment = await db.get('SELECT id, status FROM trinity_experiments WHERE mission_id = ?', missionId);
  if (!experiment) return;
  let status = experiment.status;
  if (status === 'sealed_running') status = (await trinityExperimentStore.transition(db, { id: experiment.id, status: 'sealed_complete', reason: 'all_worlds_terminal' })).status;
  if (status === 'sealed_complete') status = (await trinityExperimentStore.transition(db, { id: experiment.id, status: 'cross_examining', reason: 'comparative_review_started' })).status;
  const outcome = result?.outcome || (result?.canMerge ? 'PROMOTE_WORLD' : 'ESCALATE_EXPERIMENT');
  const decision = { outcome, reason: result?.reason || null, bestScore: result?.bestScore || 0, evidenceVectorDecision: vectorDecisionSummary(result?.comparativeAnalysis?.pareto) };
  const next = result?.canMerge || outcome === 'KEEP_PARETO_SET' ? 'decided' : 'escalated';
  if (status === 'cross_examining') status = (await trinityExperimentStore.transition(db, { id: experiment.id, status: next, decision, reason: decision.reason || outcome })).status;
  if (status === 'decided' && result?.canMerge) await trinityExperimentStore.transition(db, { id: experiment.id, status: 'promotion_preparing', decision, reason: 'candidate_promotion_prepared' });
}

function vectorDecisionSummary(pareto) {
  if (!pareto) return null;
  return {
    outcome: pareto.outcome,
    reason: pareto.reason || null,
    dimensions: pareto.dimensions || [],
    frontier: (pareto.frontier || []).map((world) => world.worldNumber),
    worlds: (pareto.worlds || []).map((world) => ({
      worldNumber: world.worldNumber,
      vector: world.vector,
      missing: world.missing,
      gateFailures: world.gateFailures || []
    }))
  };
}

async function failPromotion(input) {
  const { db, missionId, reason, artifact = null } = input;
  if (!missionId) return;
  const experiment = await db.get('SELECT id, status FROM trinity_experiments WHERE mission_id = ?', missionId);
  if (experiment?.status === 'promotion_preparing') {
    await trinityExperimentStore.transition(db, {
      id: experiment.id,
      status: 'promotion_failed',
      failureReason: reason,
      decision: { outcome: 'PROMOTION_FAILED', reason, candidateArtifact: artifact }
    });
  }
}

module.exports = { applyTrinityComparison, buildWorldReports, buildWorldReportsFromMission, latestReport, promoteWinner };
