'use strict';
const { latestReport, buildWorldReports } = require('./trinityWorldReports');

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
const candidateVerification = require('./trinityCandidateVerificationService');
const trinityClaimGraph = require('./trinityClaimGraphService');


function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}
// Direct path (dispatch_trinity / merge_trinity): worker evidence lives in the durable telemetry stream.
async function buildWorldReportsFromMission(db, missionId) {
  const worlds = await db.all(
    `SELECT w.world_number, w.strategy, w.agent_id, w.status FROM trinity_worlds w
     WHERE w.experiment_id = ? OR (w.experiment_id IS NULL AND w.id LIKE ? ESCAPE '\\'
     ) ORDER BY w.world_number`,
    missionId, `${escapeLike(missionId)}\\_world\\_%`
  );
  const reports = [];
  for (const world of worlds) {
    const rows = await db.all(
      `SELECT rowid as event_id, event_type, payload_json FROM telemetry_events WHERE agent_id = ? AND event_type IN ('EVIDENCE_REPORT','AGENT_COMPLETED') ORDER BY created_at`,
      world.agent_id
    );
    const events = rows.map((row) => {
      let payload = {};
      try { payload = JSON.parse(row.payload_json || '{}'); } catch (_) {}
      return { payload, eventType: row.event_type, eventId: row.event_id };
    });
    const report = latestReport({ events });
    const normalized = report || {};
    reports.push({
      worldNumber: world.world_number,
      runtimeProvenance: require('./trinityObservedDiversity').provenance(events),
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


function buildComparison(result) {
  return {
    canMerge: result.canMerge,
    outcome: result.outcome,
    reason: result.reason || null,
    selectedWorld: result.selectedWorld,
    selectedRole: result.selectedRole || null,
    bestScore: result.bestScore,
    paretoFrontier: result.comparativeAnalysis?.pareto?.frontier?.map((world) => world.worldNumber) || [],
    tied: result.comparativeAnalysis?.tied === true,
    jury: result.jury || null,
    crossExamination: result.comparativeAnalysis?.crossExamination || null,
    synthesizedClaims: synthesizedClaimsFor(result),
    claimGraph: trinityClaimGraph.summary(result.comparativeAnalysis?.claimGraph || { status: 'unavailable', nodes: [], edges: [] }),
    adaptiveBudget: result.comparativeAnalysis?.adaptiveBudget || null
  };
}
async function recordComparison(ctx, trinity, result) {
  await trinityService.recordWorldComparison(ctx.db, {
    missionId: trinity.missionId,
    orchestratorId: ctx.agentId,
    comparison: result.comparativeAnalysis,
    decision: {
      canMerge: result.canMerge, outcome: result.outcome, jury: result.jury || null,
      crossExamination: result.comparativeAnalysis?.crossExamination || null,
      adaptiveBudget: trinity.adaptiveBudgetDecision || null
    }
  });
}
async function experimentLatencySla(db, missionId) {
  if (!db || typeof db.get !== 'function') return null;
  const row = await db.get('SELECT budget_policy_json FROM trinity_experiments WHERE mission_id = ?', missionId);
  let budget = {};
  try { budget = JSON.parse(row?.budget_policy_json || '{}'); } catch (_) {}
  const latency = Number(budget.maxLatencyMs);
  return Number.isFinite(latency) && latency >= 0 ? latency : null;
}
async function applyTrinityComparison(ctx) {
  const trinity = ctx && ctx.autonomyPlan ? ctx.autonomyPlan.trinity : null;
  if (!trinity || trinity.activated !== true) return null;
  const threshold = Number(trinity.threshold) || 0.70;
  const initialReports = initialTrinityReports(ctx, trinity);
  const maxLatencyMs = await experimentLatencySla(ctx.db, trinity.missionId);
  const result = await require('./trinityComparisonRuntime').compareMission(ctx.db, {
    missionId: trinity.missionId, orchestratorId: ctx.agentId,
    mission: trinity.hypothesisDesign?.centralProblem,
    hypothesisDesign: trinity.hypothesisDesign,
    variantSelection: trinity.hypothesisDesign?.variantSelection,
    juryConfig: trinity.hypothesisDesign?.juryConfig, repoRoot: ctx.workspaceRoot || ctx.normalizedMission?.workspaceRoot,
    tokenBudget: ctx.autonomyPlan.tokenPolicy?.total, maxLatencyMs, dimensionThresholds: trinity.dimensionThresholds
  }, initialReports);
  result.comparativeAnalysis.adaptiveBudget = trinity.adaptiveBudgetDecision || null;
  await recordComparison(ctx, trinity, result);
  trinity.comparison = buildComparison(result);
  trinity.comparison.synthesizedClaims = synthesizedClaimsFor(result);
  trinity.comparison.promotion = await promoteWinner(ctx.db, { missionId: trinity.missionId, orchestratorId: ctx.agentId,
      result, statisticalContract: trinity.statisticalContract || null });
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
  let targetDir = null;
  try {
    const sourceDir = sourcePath;
    const candidateId = `trinity_candidate_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    targetDir = await workspaceLifecycle.createIsolatedWorkspace(sourceDir, candidateId);
    const contentHash = await prepareCandidateArtifact({ db, targetDir, sourceDir, result });
  const candidateWorkspaceId = await storeCandidateWorkspace({ db, targetDir, result, winnerWorkspace });
    const artifact = { sourceWorkspace: sourceDir, targetWorkspace: targetDir, candidateWorkspaceId, contentHash,
      assemblyReceipt: result.assemblyReceipt || null, worldNumber: result.selectedWorld, role: result.selectedRole, status: 'quarantined' };
    emit(orchestratorId, 'TRINITY_MERGE_ARTIFACT_CREATED', 'MERGE', `Created isolated candidate artifact from World ${result.selectedWorld} (${result.selectedRole}).`, artifact, 'info');
    return artifact;
  } catch (mergeError) {
    if (targetDir) await workspaceLifecycle.cleanupWorkspace(targetDir).catch(() => {});
    emit(orchestratorId, 'TRINITY_MERGE_ARTIFACT_FAILED', 'MERGE', `Failed to create merge artifact from World ${result.selectedWorld}: ${mergeError.message}`, { error: mergeError.message }, 'error');
    return null;
  }
}
async function promoteWinner(db, input = {}) {
  if (!db || !input.missionId) return executePromotion(db, input);
  const release = await require('./trinityExecutionJournal').acquire(db, input.missionId + ':promotion');
  try { return await executePromotion(db, input); }
  finally { await release(); }
}

async function executePromotion(db, input) {
  if (!promotionDatabaseAvailable(db)) {
    return { promoted: false, reason: 'database_unavailable' };
  }
  const { missionId, orchestratorId, result } = input;
  const previous = await previousPromotion({ db, missionId });
  if (previous) return previous;
  await updateExperimentDecision(db, missionId, result);
  if (result?.outcome === 'SYNTHESIZE_CLAIMS') {
    return require('./trinitySynthesisPromotion').promote(db, input, executePromotion);
  }
  const validation = validateMergeInput(db, result);
  if (!validation.valid) {
    await failPromotion({ db, missionId, reason: validation.reason });
    return { promoted: false, reason: validation.reason };
  }
  const { winner } = validation;
  const statistical = await require('./morphogenesis/capabilities/statisticalPromotionGate')
    .evaluateForNode(db, { nodeId: input.riskNodeId || orchestratorId || missionId, contract: input.statisticalContract });
  if (!statistical.allowed) {
    await failPromotion({ db, missionId, reason: statistical.reason });
    return { promoted: false, reason: statistical.reason, risk: statistical.result || null };
  }
  const context = await loadMergeContext(db, winner);
  const artifact = await createMergeArtifact(db, { result, context, orchestratorId });
  if (!artifact) {
    await failPromotion({ db, missionId, reason: 'candidate_artifact_creation_failed' });
    return { promoted: false, reason: 'candidate_artifact_creation_failed' };
  }
  return verifyCandidatePromotion(db, input, { winner, artifact });
}
const { previousPromotion, assertCandidate } = require('./trinityPromotionIntegrity');
async function updateExperimentDecision(db, missionId, result) {
  if (!missionId) return;
  const experiment = await db.get('SELECT id, status FROM trinity_experiments WHERE mission_id = ?', missionId);
  if (!experiment) return;
  const evidenceRef = comparisonEvidenceRef(missionId, result);
  const outcome = outcomeFor(result);
  const decision = decisionRecord(result, outcome);
  const next = result?.canMerge || ['KEEP_PARETO_SET', 'SYNTHESIZE_CLAIMS'].includes(outcome) ? 'decided' : 'escalated';
  const status = await advanceExperiment(db, experiment, evidenceRef);
  await persistDecision(db, { experiment, status, next, decision, evidenceRef, canMerge: result?.canMerge === true, outcome });
}
function outcomeFor(result) {
  if (result?.outcome) return result.outcome;
  return result?.canMerge ? 'PROMOTE_WORLD' : 'ESCALATE_EXPERIMENT';
}
function decisionRecord(result, outcome) {
  return {
    outcome, reason: result?.reason || null, bestScore: result?.bestScore || 0,
    evidenceVectorDecision: vectorDecisionSummary(result?.comparativeAnalysis?.pareto),
    jury: result?.jury || null,
    crossExamination: result?.comparativeAnalysis?.crossExamination || null,
    research: result?.comparativeAnalysis?.research || null,
    variantExecution: result?.comparativeAnalysis?.variantExecution || null,
    synthesizedClaims: outcome === 'SYNTHESIZE_CLAIMS' ? result?.mergedEvidence?.claims || [] : [],
    claimGraph: trinityClaimGraph.summary(result?.comparativeAnalysis?.claimGraph || { status: 'unavailable', nodes: [], edges: [] })
  };
}
async function advanceExperiment(db, experiment, evidenceRef) {
  let status = experiment.status;
  if (status === 'sealed_running') status = (await trinityExperimentStore.transition(db, { id: experiment.id, status: 'sealed_complete', reason: 'all_worlds_terminal', evidenceRef })).status;
  if (status === 'sealed_complete') status = (await trinityExperimentStore.transition(db, { id: experiment.id, status: 'cross_examining', reason: 'comparative_review_started', evidenceRef })).status;
  return status;
}
async function persistDecision(db, input) {
  const { experiment, status, next, decision, evidenceRef, canMerge, outcome } = input;
  if (status === 'cross_examining') {
    await trinityExperimentStore.transition(db, { id: experiment.id, status: next, decision, reason: decision.reason || outcome, evidenceRef });
  }
  if ((status === 'decided' || next === 'decided') && canMerge) {
    await trinityExperimentStore.transition(db, { id: experiment.id, status: 'promotion_preparing', decision, reason: 'candidate_promotion_prepared', evidenceRef });
  }
}

function comparisonEvidenceRef(missionId, result) {
  const worlds = (result?.comparativeAnalysis?.scoredWorlds || []).map((world) => ({
    worldNumber: world.worldNumber,
    agentId: world.agentId,
    evidence: world.report?.evidence,
    vector: world.report?.evidenceVector,
    vectorRefs: world.report?.evidenceVectorEvidence,
    crossExamination: world.report?.crossExamination
  }));
  const digest = crypto.createHash('sha256').update(JSON.stringify(worlds)).digest('hex');
  return `trinity-comparison:${missionId}:${digest}`;
}

const { vectorDecisionSummary } = require('./trinityVectorDecisionSummary');

async function failPromotion(input) {
  const { db, missionId, reason, artifact = null } = input;
  if (!missionId) return;
  const experiment = await db.get('SELECT id, status FROM trinity_experiments WHERE mission_id = ?', missionId);
  if (experiment?.status === 'promotion_preparing') {
    await trinityExperimentStore.transition(db, {
      id: experiment.id,
      status: 'promotion_failed',
      failureReason: reason,
      decision: { outcome: 'PROMOTION_FAILED', reason, candidateArtifact: artifact },
      evidenceRef: artifact?.candidateWorkspaceId || `trinity-failure:${reason}`
    });
  }
}

module.exports = { applyTrinityComparison, buildWorldReports, buildWorldReportsFromMission, latestReport, promoteWinner };

function initialTrinityReports(ctx, trinity) {
  const dossiers = ctx.usable || workerEvidenceDossiers(ctx.agentId, ctx.workers || []);
  const initialReports = buildWorldReports(ctx.workers || [], dossiers, { members: trinity.members || [] });
  return initialReports;
}

function synthesizedClaimsFor(result) {
  return result.outcome === 'SYNTHESIZE_CLAIMS' ? result.mergedEvidence?.claims || [] : [];
}

async function prepareCandidateArtifact({ db, targetDir, sourceDir, result }) {
    let contentHash;
    try {
      contentHash = await hashWorkspace(targetDir);
      if (contentHash !== await hashWorkspace(sourceDir)) {
        await workspaceLifecycle.cleanupWorkspace(targetDir).catch(() => {});
        throw Object.assign(new Error('Trinity candidate differs from the selected world.'), { code: 'TRINITY_CANDIDATE_HASH_MISMATCH' });
      }
      if (result.synthesisPlan) {
        const assembly = await require('./trinityArtifactAssembler').assemble(db, {
          candidate: targetDir, plan: result.synthesisPlan, worlds: result.comparativeAnalysis.scoredWorlds
        });
        contentHash = assembly.contentHash;
        result.assemblyReceipt = assembly;
      }
    } catch (error) {
      await workspaceLifecycle.cleanupWorkspace(targetDir).catch(() => {});
      throw error;
    }
  return contentHash;
}

async function verifyCandidatePromotion(db, input, { winner, artifact }) {
  const { missionId, orchestratorId, result } = input;
  try {
    const verifiedWinner = { ...winner, report: { ...winner.report, claims: result.mergedEvidence?.claims || winner.report?.claims || [] } };
    const verification = await candidateVerification.verify(db, { missionId, winner: verifiedWinner, artifact });
    const experiment = await db.get('SELECT id FROM trinity_experiments WHERE mission_id = ?', missionId);
    if (!experiment) throw new Error('Trinity experiment disappeared before final promotion.');
  const decision = promotionDecision(result, artifact, verification);
    const git = require('./agentGitService');
    const gitRequest = { user: { username: 'trinity-runtime' }, body: {} };
    await assertCandidate(artifact, verification.contentHash);
    const commit = await git.createCommit(gitRequest, {
      agentId: winner.agentId,
      refName: `trinity/${experiment.id}`,
      metadata: { experimentId: experiment.id, worldNumber: result.selectedWorld, contentHash: verification.contentHash, candidateWorkspaceId: artifact.candidateWorkspaceId, integrationChecks: verification.integrationChecks, claimChecks: verification.claimChecks, assemblyReceipt: artifact.assemblyReceipt }
    });
    const stored = await git.getObject(db, gitRequest, commit.id);
    if (!stored || !git.verifyObjectSignature(stored)) throw new Error('AgentGit candidate reference signature is invalid.');
    decision.agentGit = { objectId: commit.id, refName: commit.refName, commitHash: commit.commitHash, stateHash: commit.stateHash };
    await assertCandidate(artifact, verification.contentHash);
    artifact.status = 'promoted';
    artifact.agentGit = decision.agentGit;
    const { withTransaction } = require('../db');
    await withTransaction(db, async (tx) => {
      await updateWorldStatuses(tx, result, winner);
      await tx.run("UPDATE trinity_worlds SET status = 'promoted', updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?", winner.agentId);
      await tx.run(
        'UPDATE workspaces SET tags = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        JSON.stringify(['trinity_candidate', 'promoted']), `Verified Trinity candidate for experiment ${experiment.id}.`, artifact.candidateWorkspaceId
      );
      await trinityExperimentStore.transition(tx, {
        id: experiment.id, status: 'promoted', decision,
        reason: 'candidate_checks_hash_and_agent_git_verified', evidenceRef: commit.id
      });
    });
    emit(orchestratorId, 'TRINITY_WINNER_SELECTED', 'SELECT_TRINITY', `Promoted verified candidate from World ${result.selectedWorld} (${result.selectedRole}).`, { missionId, worldNumber: result.selectedWorld, role: result.selectedRole, artifact, verification, agentGit: decision.agentGit }, 'info');
    return { promoted: true, worldNumber: result.selectedWorld, role: result.selectedRole, score: result.bestScore, agentId: winner.agentId, artifact, verification, agentGit: decision.agentGit };
  } catch (error) {
    const quarantinedArtifact = { ...artifact, status: 'quarantined', failure: error.message };
    await failPromotion({ db, missionId, reason: error.code || 'candidate_verification_failed', artifact: quarantinedArtifact });
    emit(orchestratorId, 'TRINITY_PROMOTION_FAILED', 'PROMOTE_TRINITY', `Candidate promotion failed: ${error.message}`, { missionId, artifact }, 'error');
    return { promoted: false, candidateCreated: true, reason: error.code || 'candidate_verification_failed', artifact: quarantinedArtifact };
  }

}

function promotionDecision(result, artifact, verification) {
    const decision = {
      outcome: 'PROMOTED', worldNumber: result.selectedWorld, artifact, verification,
      jury: result.jury || null, crossExamination: result.comparativeAnalysis?.crossExamination || null
    };
  return decision;
}

function promotionDatabaseAvailable(db) {
  return db && typeof db.get === 'function' && typeof db.run === 'function';
}

async function storeCandidateWorkspace({ db, targetDir, result, winnerWorkspace }) {
    const candidateWorkspaceId = `trinity_candidate_${crypto.randomBytes(8).toString('hex')}`;
    await db.run(
      `INSERT INTO workspaces (id, name, path, visibility, language, description, tags, organization_id, project_id)
       VALUES (?, ?, ?, 'Private', ?, ?, ?, ?, ?)`,
      candidateWorkspaceId, `Trinity candidate World ${result.selectedWorld}`, targetDir,
      winnerWorkspace.language || 'Mixed', `Quarantined Trinity candidate awaiting verification for world ${result.selectedWorld}.`,
      JSON.stringify(['trinity_candidate', 'quarantined']),
      winnerWorkspace.organization_id || null, winnerWorkspace.project_id || null
    );
  return candidateWorkspaceId;
}
