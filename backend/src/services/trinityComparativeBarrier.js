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

function buildComparison(trinity, result) {
  return {
    canMerge: result.canMerge,
    selectedWorld: result.selectedWorld,
    selectedRole: result.selectedRole || null,
    bestScore: result.bestScore,
    tied: result.comparativeAnalysis?.tied === true
  };
}

async function recordComparison(ctx, trinity, result) {
  await trinityService.recordWorldComparison(ctx.db, {
    missionId: trinity.missionId,
    orchestratorId: ctx.agentId,
    comparison: result.comparativeAnalysis,
    decision: { canMerge: result.canMerge, threshold: Number(trinity.threshold) || 0.70 }
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
  trinity.comparison = buildComparison(trinity, result);
  trinity.comparison.promotion = await promoteWinner(ctx.db, { missionId: trinity.missionId, orchestratorId: ctx.agentId, result });
  emitComparison(ctx, trinity, result);
  return result;
}

function emitComparison(ctx, trinity, result) {
  const detail = result.canMerge
    ? `Trinity merged World ${result.selectedWorld} (${result.selectedRole}) score=${result.bestScore}.`
    : `Trinity escalated: no world met the evidence threshold (best ${result.bestScore}).`;
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
  return { winnerAgent };
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
  const { winnerAgent } = context;
  if (!winnerAgent?.workspace_id) return null;
  const winnerWorkspace = await db.get("SELECT path FROM workspaces WHERE id = ?", winnerAgent.workspace_id);
  if (!winnerWorkspace?.path) return null;
  try {
    const sourceDir = winnerWorkspace.path;
    const candidateId = `trinity_candidate_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const targetDir = await workspaceLifecycle.createIsolatedWorkspace(sourceDir, candidateId);
    let contentHash;
    try {
      contentHash = await hashWorkspace(targetDir);
    } catch (error) {
      await workspaceLifecycle.cleanupWorkspace(targetDir).catch(() => {});
      throw error;
    }
    const artifact = { sourceWorkspace: sourceDir, targetWorkspace: targetDir, contentHash, worldNumber: result.selectedWorld, role: result.selectedRole, status: 'candidate' };
    emit(orchestratorId, 'TRINITY_MERGE_ARTIFACT_CREATED', 'MERGE', `Created isolated candidate artifact from World ${result.selectedWorld} (${result.selectedRole}).`, artifact, 'info');
    return artifact;
  } catch (mergeError) {
    emit(orchestratorId, 'TRINITY_MERGE_ARTIFACT_FAILED', 'MERGE', `Failed to create merge artifact from World ${result.selectedWorld}: ${mergeError.message}`, { error: mergeError.message }, 'error');
    return null;
  }
}

async function promoteWinner(db, input = {}) {
  const { missionId, orchestratorId, result } = input;
  await updateExperimentDecision(db, missionId, result);
  const validation = validateMergeInput(db, result);
  if (!validation.valid) return { promoted: false, reason: validation.reason };
  const { winner } = validation;
  const context = await loadMergeContext(db, winner);
  const artifact = await createMergeArtifact(db, { result, context, orchestratorId });
  if (!artifact) {
    await failPromotion({ db, missionId, reason: 'candidate_artifact_creation_failed' });
    return { promoted: false, reason: 'candidate_artifact_creation_failed' };
  }
  await updateWorldStatuses(db, result, winner);
  await failPromotion({ db, missionId, reason: 'integration_verification_and_agent_git_commit_required', artifact });
  emit(orchestratorId, 'TRINITY_WINNER_SELECTED', 'SELECT_TRINITY', `Selected World ${result.selectedWorld} (${result.selectedRole}); integration verification and AgentGit commit are pending.`, { missionId, worldNumber: result.selectedWorld, role: result.selectedRole, score: result.bestScore, artifact }, 'warning');
  return { promoted: false, candidateCreated: true, reason: 'integration_verification_and_agent_git_commit_required', worldNumber: result.selectedWorld, role: result.selectedRole, score: result.bestScore, agentId: winner.agentId, artifact };
}

async function updateExperimentDecision(db, missionId, result) {
  if (!missionId) return;
  const experiment = await db.get('SELECT id, status FROM trinity_experiments WHERE mission_id = ?', missionId);
  if (!experiment) return;
  let status = experiment.status;
  if (status === 'sealed_running') status = (await trinityExperimentStore.transition(db, { id: experiment.id, status: 'sealed_complete' })).status;
  if (status === 'sealed_complete') status = (await trinityExperimentStore.transition(db, { id: experiment.id, status: 'cross_examining' })).status;
  const decision = { outcome: result?.canMerge ? 'PROMOTE_WORLD' : 'ESCALATE_EXPERIMENT', reason: result?.reason || null, bestScore: result?.bestScore || 0 };
  const next = result?.canMerge ? 'decided' : 'escalated';
  if (status === 'cross_examining') status = (await trinityExperimentStore.transition(db, { id: experiment.id, status: next, decision })).status;
  if (status === 'decided') await trinityExperimentStore.transition(db, { id: experiment.id, status: 'promotion_preparing', decision });
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
