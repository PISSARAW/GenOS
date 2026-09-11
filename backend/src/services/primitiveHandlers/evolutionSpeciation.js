/**
 * Lot 3 : speciation / plasmid / stagnation primitives — split of evolution.js.
 */
const telemetry = require('../telemetryObserver');
const { getDatabase } = require('../../db');
const genosCli = require('../genosCli');
const { enforceReproductionLimits } = require('./fundamentals');

async function computePhylogeneticDivergence(nicheKeys) {
  if (nicheKeys.length < 2) return { divergence: null };
  try {
    const phyloRun = await genosCli.runPhylogeny({
      action: 'divergence',
      genomeA: nicheKeys[0],
      genomeB: nicheKeys[1]
    });
    if (phyloRun.ok && phyloRun.json) return { divergence: phyloRun.json };
    return { error: 'Phylogeny divergence returned no result.' };
  } catch (error) {
    return { error: `Phylogeny divergence failed: ${error.message}` };
  }
}

async function speciation(context) {
  const db = await getDatabase();
  const orchestratorId = context.orchestratorId;
  if (!orchestratorId) {
    return { success: false, error: 'orchestratorId required for speciation.' };
  }
  const workers = await db.all(
    "SELECT id, role, current_task, status FROM agents WHERE parent_agent_id = ? AND execution_mode = 'worker'",
    orchestratorId
  );
  const niches = {};
  for (const w of workers) {
    const niche = w.role || 'default';
    if (!niches[niche]) niches[niche] = [];
    niches[niche].push(w.id);
  }

  // Calcul de divergence phylogénétique entre niches via genosCli
  const nicheKeys = Object.keys(niches);
  const phylogeny = await computePhylogeneticDivergence(nicheKeys);
  if (phylogeny.error) return { success: false, error: phylogeny.error };

  telemetry.emitEvent({
    eventType: 'EVOLUTION_SPECIATION',
    agentId: orchestratorId,
    action: 'SPECIATION',
    detail: 'Identified ' + nicheKeys.length + ' niches from ' + workers.length + ' workers.',
    severity: 'info',
    payload: { niches, workerCount: workers.length, phylogeneticDivergence: phylogeny.divergence }
  });
  return {
    success: workers.length > 0,
    nicheCount: nicheKeys.length,
    niches,
    phylogeneticDivergence: phylogeny.divergence
  };
}

async function loadPlasmidParent(db, context) {
  const agentId = context.agentId || context.orchestratorId;
  if (!agentId) return { error: 'agentId or orchestratorId required for plasmid divergence.' };
  const parent = await db.get(
    'SELECT id, current_task, workspace_id, model_tier FROM agents WHERE id = ?',
    agentId
  );
  if (!parent) return { error: `Parent agent not found: ${agentId}` };
  const reproductionGuard = await enforceReproductionLimits(db, agentId, context);
  if (!reproductionGuard.allowed) return { blocked: { success: false, ...reproductionGuard } };
  return { agentId, parent };
}

function firstTruthy(values) {
  for (const value of values) {
    if (value) return value;
  }
  return null;
}

function resolvePlasmidConfig(parent, context) {
  const plasmidId = firstTruthy([context.plasmidId, context.plasmid ? context.plasmid.id : null, 'plasmid_core']);
  return {
    workspaceId: firstTruthy([parent.workspace_id, context.workspaceId, null]),
    modelTier: firstTruthy([parent.model_tier, context.modelTier, 'standard']),
    baseTask: firstTruthy([context.task, parent.current_task, 'Plasmid-guided execution']),
    plasmidId,
    plasmidName: firstTruthy([context.plasmidName, context.plasmid ? context.plasmid.name : null, plasmidId]),
    optimizationGoal: firstTruthy([context.optimizationGoal, 'optimize_efficiency_and_tokens'])
  };
}

async function forkPlasmidBranches(db, config, agentId) {
  // 1. Fork Counterfactuel : Branche Exploitation (Baseline) & Branche Exploration (Mutant)
  const baselineId = `worker_base_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const mutantId = `worker_mut_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const baselineTask = `[BASELINE_EXPLOITATION] Replay plasmid ${config.plasmidName}: ${config.baseTask}`;
  const mutantTask = `[MUTANT_OPTIMIZATION] Discover optimal alternative to plasmid ${config.plasmidName} (${config.optimizationGoal}): ${config.baseTask}`;

  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, model_tier, parent_agent_id, lineage_relation, current_task) VALUES (?, ?, 'baseline_executor', 'idle', 'GenOS', 'worker', ?, ?, ?, 'plasmid_exploitation', ?)",
    baselineId, `Baseline (${config.plasmidName})`, config.workspaceId, config.modelTier, agentId, baselineTask
  );

  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, model_tier, parent_agent_id, lineage_relation, current_task) VALUES (?, ?, 'plasmid_optimizer', 'idle', 'GenOS', 'worker', ?, ?, ?, 'plasmid_mutation', ?)",
    mutantId, `Mutant Optimizer (${config.plasmidName})`, config.workspaceId, config.modelTier, agentId, mutantTask
  );

  telemetry.emitEvent({
    eventType: 'PLASMID_DIVERGENCE_FORK',
    agentId: agentId,
    action: 'PLASMID_DIVERGENT_FORK',
    detail: `Spawned counterfactual fork on plasmid ${config.plasmidName}: Baseline ${baselineId} vs Mutant ${mutantId}`,
    severity: 'info',
    payload: { plasmidId: config.plasmidId, plasmidName: config.plasmidName, baselineId, mutantId, optimizationGoal: config.optimizationGoal }
  });
  return { baselineId, mutantId };
}

function scoreWithFallback(primary, secondary, fallback) {
  const value = primary ?? secondary ?? fallback;
  return Number(value);
}

function resolveDivergenceScores(context) {
  const mutantScore = scoreWithFallback(context.mutantScore, context.mutantFitness, context.winner === 'mutant' ? 1.0 : 0.0);
  const baselineScore = scoreWithFallback(context.baselineScore, context.baselineFitness, 0.5);
  if (!Number.isFinite(mutantScore) || !Number.isFinite(baselineScore)) {
    return { error: 'Mutant and baseline scores must be finite numbers.' };
  }
  return { mutantScore, baselineScore };
}

async function promoteMutantPlasmid(db, options) {
  const { agentId, config, baselineId, mutantId, mutantScore, baselineScore, context } = options;
  const newPlasmidId = `plasmid_v2_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const newContent = context.candidatePlasmidCode || context.mutantSolution || `// Optimized mutant replacing ${config.plasmidId}\n// Goal: ${config.optimizationGoal}`;
  const { embed } = require('../embeddingProvider');
  const { textToVector } = require('../memoryScoring');
  const vec = (await embed(newContent)) || textToVector(newContent);
  const embeddingBuffer = Buffer.from(new Float32Array(vec).buffer);
  await db.run(
    `INSERT INTO genome_decisions (id, title, content, created_by, category, synaptic_weight, embedding_blob, organization_id, project_id)
     VALUES (?, ?, ?, ?, 'Plasmid', 2.5, ?, ?, ?)`,
    newPlasmidId, `Plasmid Evolved (${config.plasmidName})`, newContent, mutantId, embeddingBuffer, context.organizationId || null, context.projectId || null
  );

  await db.run("UPDATE agents SET status = 'completed' WHERE id = ?", mutantId).catch(() => {});
  await db.run("UPDATE agents SET status = 'apoptosis', is_apoptotic = 1 WHERE id = ?", baselineId).catch(() => {});

  telemetry.emitEvent({
    eventType: 'PLASMID_MUTATION_PROMOTED',
    agentId: agentId,
    action: 'PROMOTE_MUTANT_PLASMID',
    detail: `Mutant ${mutantId} outperformed baseline (score ${mutantScore} > ${baselineScore}). New plasmid synthesized: ${newPlasmidId}`,
    severity: 'info',
    payload: { originalPlasmidId: config.plasmidId, newPlasmidId, winner: mutantId, scores: { mutantScore, baselineScore } }
  });

  return {
    success: true,
    branch: 'mutant_promoted',
    winner: 'mutant',
    winningAgentId: mutantId,
    originalPlasmidId: config.plasmidId,
    newPlasmidId,
    scores: { mutant: mutantScore, baseline: baselineScore },
    baselineId,
    mutantId
  };
}

async function retainBaselinePlasmid(db, options) {
  const { agentId, config, baselineId, mutantId, mutantScore, baselineScore } = options;
  // Baseline retenue : apoptose de la branche mutante
  await db.run("UPDATE agents SET status = 'completed' WHERE id = ?", baselineId).catch(() => {});
  await db.run("UPDATE agents SET status = 'apoptosis', is_apoptotic = 1 WHERE id = ?", mutantId).catch(() => {});

  telemetry.emitEvent({
    eventType: 'PLASMID_MUTATION_PRUNED',
    agentId: agentId,
    action: 'RETAIN_BASELINE_PLASMID',
    detail: `Baseline plasmid ${config.plasmidId} retained. Mutant ${mutantId} pruned (score ${mutantScore} <= ${baselineScore}).`,
    severity: 'info',
    payload: { plasmidId: config.plasmidId, retainedAgentId: baselineId, prunedAgentId: mutantId, scores: { mutantScore, baselineScore } }
  });

  return {
    success: true,
    branch: 'baseline_retained',
    winner: 'baseline',
    winningAgentId: baselineId,
    plasmidId: config.plasmidId,
    scores: { mutant: mutantScore, baseline: baselineScore },
    baselineId,
    mutantId
  };
}

async function plasmidDivergence(context) {
  const db = await getDatabase();
  const loaded = await loadPlasmidParent(db, context);
  if (loaded.error) return { success: false, error: loaded.error };
  if (loaded.blocked) return loaded.blocked;
  const config = resolvePlasmidConfig(loaded.parent, context);
  const fork = await forkPlasmidBranches(db, config, loaded.agentId);

  // 2. Évaluation de la divergence et arbitrage
  const scores = resolveDivergenceScores(context);
  if (scores.error) return { success: false, error: scores.error };
  if (scores.mutantScore > scores.baselineScore || context.winner === 'mutant') {
    return promoteMutantPlasmid(db, { agentId: loaded.agentId, config, baselineId: fork.baselineId, mutantId: fork.mutantId, mutantScore: scores.mutantScore, baselineScore: scores.baselineScore, context });
  }
  return retainBaselinePlasmid(db, { agentId: loaded.agentId, config, baselineId: fork.baselineId, mutantId: fork.mutantId, mutantScore: scores.mutantScore, baselineScore: scores.baselineScore });
}

async function countRecentFailures(db, agentId, lookback) {
  if (!db) return { failureCount: 0, recentEvents: [] };
  try {
    const recentEvents = await db.all(
      `SELECT event_type, action, severity, created_at FROM telemetry_events
       WHERE agent_id = ? ORDER BY id DESC LIMIT ?`,
      agentId, lookback
    );
    const failureCount = recentEvents.filter(e => String(e.severity || '').toLowerCase() === 'critical' || String(e.severity || '').toLowerCase() === 'warning' || e.action === 'FAILURE').length;
    return { failureCount, recentEvents };
  } catch (_) {
    return { failureCount: 0, recentEvents: [] };
  }
}

function stagnationSeverity(stagnant) {
  if (stagnant) return 'warning';
  return 'info';
}

async function stagnationCheck(context = {}) {
  const db = await getDatabase();
  const agentId = context.agentId || context.orchestratorId || 'system';
  const threshold = Number(context.stagnationThreshold ?? 3);
  const lookback = Number(context.lookback ?? 6);
  const observed = await countRecentFailures(db, agentId, lookback);
  let failureCount = observed.failureCount;
  if (Number.isFinite(Number(context.consecutiveFailures))) {
    failureCount = Math.max(failureCount, Number(context.consecutiveFailures));
  }
  const stagnant = failureCount >= threshold || Boolean(context.forceStagnation);
  telemetry.emitEvent({
    eventType: 'STAGNATION_EVALUATED',
    agentId,
    action: 'STAGNATION_CHECK',
    detail: `Stagnation check evaluated: stagnant=${stagnant} (failures: ${failureCount}/${threshold})`,
    severity: stagnationSeverity(stagnant),
    payload: { agentId, failureCount, threshold, stagnant }
  });
  return {
    success: true,
    stagnant,
    failureCount,
    threshold,
    recommendedAction: stagnant ? 'hypermutation_reheat' : 'continue'
  };
}

module.exports = {
  speciation,
  plasmidDivergence,
  stagnationCheck
};
