/**
 * Lot 3 : Primitives d'Évolution (mutate, breed, select, pareto, speciation)
 */
const telemetry = require('../telemetryObserver');
const { getDatabase } = require('../../db');
const geneticsService = require('../geneticsService');
const genosCli = require('../genosCli');

async function mutate(context) {
  const db = await getDatabase();
  const agentId = context.agentId || context.orchestratorId;
  if (!agentId) {
    return { success: false, error: 'agentId required for mutation.' };
  }
  const parent = await db.get('SELECT id, current_task, workspace_id, model_tier FROM agents WHERE id = ?', agentId);
  if (!parent) {
    return { success: false, error: 'Parent agent not found: ' + agentId };
  }
  const mutations = context.mutations || ['Explore an alternative approach.'];
  const mutatedTask = (parent.current_task || 'task') + ' [MUTATION: ' + mutations.join('; ') + ']';
  const mutantId = 'mutant_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, model_tier, parent_agent_id, lineage_relation, current_task) VALUES (?, ?, 'mutant', 'idle', 'GenOS', 'worker', ?, ?, ?, 'mutation', ?)",
    mutantId, 'Mutant of ' + agentId, parent.workspace_id, parent.model_tier || 'standard', agentId, mutatedTask
  );
  telemetry.emitEvent({
    eventType: 'EVOLUTION_MUTATION',
    agentId: agentId,
    action: 'MUTATE',
    detail: 'Created mutant ' + mutantId + ' with perturbation: ' + mutations.join('; '),
    severity: 'info',
    payload: { mutantId, mutations }
  });
  return { success: true, mutantId, mutatedTask };
}

async function breed(context) {
  const db = await getDatabase();
  const parentA = context.parentA || context.agentId;
  const parentB = context.parentB;
  if (!parentA || !parentB) {
    return { success: false, error: 'parentA and parentB required for breeding.' };
  }
  const rowA = await db.get('SELECT id, name, role, current_task, model_tier, workspace_id FROM agents WHERE id = ?', parentA);
  const rowB = await db.get('SELECT id, name, role, current_task, model_tier, workspace_id FROM agents WHERE id = ?', parentB);
  if (!rowA || !rowB) {
    return { success: false, error: 'One or both parents not found.' };
  }

  // 1. Recombinaison méiotique des gènes cognitifs (stratégie, outils, hyperparamètres)
  const childRecomb = geneticsService.crossoverGenome(rowA, rowB, {
    strategy: context.strategy || 'uniform',
    mutationRate: context.mutationRate || 0.05
  });

  // 2. Recombinaison native méiotique Rust via crates/genos-reproduction
  let nativeRecomb = null;
  try {
    const cliRun = await genosCli.runCrossover({
      parentA: rowA.id,
      parentB: rowB.id,
      swapProb: context.swapProb || 0.5,
      crossoverPoint: context.crossoverPoint
    });
    if (cliRun.ok && cliRun.json) {
      nativeRecomb = cliRun.json;
    }
  } catch (_) {}

  const strategy = childRecomb.childGenes?.strategy || 'adaptive-hybrid';
  const tools = childRecomb.childGenes?.tools || ['genos_inspect'];
  const crossoverTask = `${rowA.name || parentA} (${rowA.role || 'worker'}) x ${rowB.name || parentB} (${rowB.role || 'worker'}) -> Strategy: ${strategy}. Tools: [${tools.join(', ')}]. Mission: ${rowA.current_task || 'collaborative mission'}`;

  const childId = childRecomb.childId || ('child_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, model_tier, parent_agent_id, lineage_relation, current_task) VALUES (?, ?, 'offspring', 'idle', 'GenOS', 'worker', ?, ?, ?, 'crossover', ?)",
    childId, 'Offspring of ' + (rowA.name || parentA) + ' x ' + (rowB.name || parentB), rowA.workspace_id, rowA.model_tier || 'standard', parentA, crossoverTask
  );

  telemetry.emitEvent({
    eventType: 'EVOLUTION_BREED',
    agentId: parentA,
    action: 'BREED',
    detail: 'Bred child ' + childId + ' via Meiotic Crossover: predicted fitness ' + childRecomb.predictedFitnessScore,
    severity: 'info',
    payload: {
      childId, parentA, parentB,
      childGenes: childRecomb.childGenes,
      fitnessScore: childRecomb.predictedFitnessScore,
      nativeRecombination: nativeRecomb
    }
  });

  return {
    success: true,
    childId,
    parentA,
    parentB,
    crossoverTask,
    childGenes: childRecomb.childGenes,
    fitnessScore: childRecomb.predictedFitnessScore,
    nativeRecombination: nativeRecomb
  };
}

async function select(context) {
  const db = await getDatabase();
  const candidates = context.candidates || [];
  if (candidates.length === 0) {
    return { success: false, error: 'No candidates provided for selection.' };
  }
  const scored = [];
  for (const cId of candidates) {
    const row = await db.get("SELECT id, status, current_task FROM agents WHERE id = ?", cId);
    if (!row) continue;
    const statusScore = row.status === 'completed' ? 10 : (row.status === 'running' ? 5 : 0);
    scored.push({ id: cId, status: row.status, score: statusScore });
  }
  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0] || null;
  const losers = scored.slice(1).map(s => s.id);
  telemetry.emitEvent({
    eventType: 'EVOLUTION_SELECTION',
    agentId: context.orchestratorId || 'strategy_adapter',
    action: 'SELECT',
    detail: 'Selected winner ' + (winner ? winner.id : 'none') + ' from ' + candidates.length + ' candidates.',
    severity: 'info',
    payload: { winner, losers, scored }
  });
  return { success: !!winner, winner, losers, scored };
}

async function paretoSelect(context) {
  const candidates = context.candidates || [];
  const objectives = context.objectives || ['quality', 'cost'];
  if (candidates.length === 0) {
    return { success: false, error: 'No candidates for Pareto selection.' };
  }
  const points = candidates.map(c => ({
    id: c.id || c,
    scores: objectives.map(obj => c[obj] || Math.random())
  }));
  const paretoFront = points.filter((point) => {
    return !points.some(other => {
      if (other.id === point.id) return false;
      return other.scores.every((s, j) => s >= point.scores[j]) && other.scores.some((s, j) => s > point.scores[j]);
    });
  });
  const dominated = points.filter(p => !paretoFront.some(f => f.id === p.id));
  telemetry.emitEvent({
    eventType: 'EVOLUTION_PARETO',
    agentId: context.orchestratorId || 'strategy_adapter',
    action: 'PARETO_SELECT',
    detail: 'Pareto front: ' + paretoFront.length + ' non-dominated / ' + points.length + ' total.',
    severity: 'info',
    payload: { paretoFront, dominated, objectives }
  });
  return { success: paretoFront.length > 0, paretoFront, dominated, objectives };
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
  let phylogeneticDivergence = null;
  if (nicheKeys.length >= 2) {
    try {
      const phyloRun = await genosCli.runPhylogeny({
        action: 'divergence',
        genomeA: nicheKeys[0],
        genomeB: nicheKeys[1]
      });
      if (phyloRun.ok && phyloRun.json) {
        phylogeneticDivergence = phyloRun.json;
      }
    } catch (_) {}
  }

  telemetry.emitEvent({
    eventType: 'EVOLUTION_SPECIATION',
    agentId: orchestratorId,
    action: 'SPECIATION',
    detail: 'Identified ' + nicheKeys.length + ' niches from ' + workers.length + ' workers.',
    severity: 'info',
    payload: { niches, workerCount: workers.length, phylogeneticDivergence }
  });
  return {
    success: workers.length > 0,
    nicheCount: nicheKeys.length,
    niches,
    phylogeneticDivergence
  };
}

async function plasmidDivergence(context) {
  const db = await getDatabase();
  const agentId = context.agentId || context.orchestratorId;
  if (!agentId) {
    return { success: false, error: 'agentId or orchestratorId required for plasmid divergence.' };
  }

  const parent = await db.get(
    'SELECT id, current_task, workspace_id, model_tier FROM agents WHERE id = ?',
    agentId
  );
  const workspaceId = parent?.workspace_id || context.workspaceId || null;
  const modelTier = parent?.model_tier || context.modelTier || 'standard';
  const baseTask = context.task || parent?.current_task || 'Plasmid-guided execution';
  const plasmidId = context.plasmidId || context.plasmid?.id || 'plasmid_core';
  const plasmidName = context.plasmidName || context.plasmid?.name || plasmidId;
  const optimizationGoal = context.optimizationGoal || 'optimize_efficiency_and_tokens';

  // 1. Fork Counterfactuel : Branche Exploitation (Baseline) & Branche Exploration (Mutant)
  const baselineId = `worker_base_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const mutantId = `worker_mut_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const baselineTask = `[BASELINE_EXPLOITATION] Replay plasmid ${plasmidName}: ${baseTask}`;
  const mutantTask = `[MUTANT_OPTIMIZATION] Discover optimal alternative to plasmid ${plasmidName} (${optimizationGoal}): ${baseTask}`;

  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, model_tier, parent_agent_id, lineage_relation, current_task) VALUES (?, ?, 'baseline_executor', 'idle', 'GenOS', 'worker', ?, ?, ?, 'plasmid_exploitation', ?)",
    baselineId, `Baseline (${plasmidName})`, workspaceId, modelTier, agentId, baselineTask
  );

  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, model_tier, parent_agent_id, lineage_relation, current_task) VALUES (?, ?, 'plasmid_optimizer', 'idle', 'GenOS', 'worker', ?, ?, ?, 'plasmid_mutation', ?)",
    mutantId, `Mutant Optimizer (${plasmidName})`, workspaceId, modelTier, agentId, mutantTask
  );

  telemetry.emitEvent({
    eventType: 'PLASMID_DIVERGENCE_FORK',
    agentId: agentId,
    action: 'PLASMID_DIVERGENT_FORK',
    detail: `Spawned counterfactual fork on plasmid ${plasmidName}: Baseline ${baselineId} vs Mutant ${mutantId}`,
    severity: 'info',
    payload: { plasmidId, plasmidName, baselineId, mutantId, optimizationGoal }
  });

  // 2. Évaluation de la divergence et arbitrage
  const mutantScore = Number(context.mutantScore ?? context.mutantFitness ?? (context.winner === 'mutant' ? 1.0 : 0.0));
  const baselineScore = Number(context.baselineScore ?? context.baselineFitness ?? 0.5);
  const mutantPromoted = mutantScore > baselineScore || context.winner === 'mutant';

  let newPlasmidId = null;
  if (mutantPromoted) {
    newPlasmidId = `plasmid_v2_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newContent = context.candidatePlasmidCode || context.mutantSolution || `// Optimized mutant replacing ${plasmidId}\n// Goal: ${optimizationGoal}`;
    const float32 = new Float32Array(new Array(768).fill(0.0));
    const embeddingBuffer = Buffer.from(float32.buffer);
    await db.run(
      `INSERT INTO genome_decisions (id, title, content, created_by, category, synaptic_weight, embedding_blob)
       VALUES (?, ?, ?, ?, 'Plasmid', 2.5, ?)`,
      newPlasmidId, `Plasmid Evolved (${plasmidName})`, newContent, mutantId, embeddingBuffer
    );

    await db.run("UPDATE agents SET status = 'completed' WHERE id = ?", mutantId).catch(() => {});
    await db.run("UPDATE agents SET status = 'apoptosis', is_apoptotic = 1 WHERE id = ?", baselineId).catch(() => {});

    telemetry.emitEvent({
      eventType: 'PLASMID_MUTATION_PROMOTED',
      agentId: agentId,
      action: 'PROMOTE_MUTANT_PLASMID',
      detail: `Mutant ${mutantId} outperformed baseline (score ${mutantScore} > ${baselineScore}). New plasmid synthesized: ${newPlasmidId}`,
      severity: 'info',
      payload: { originalPlasmidId: plasmidId, newPlasmidId, winner: mutantId, scores: { mutantScore, baselineScore } }
    });

    return {
      success: true,
      branch: 'mutant_promoted',
      winner: 'mutant',
      winningAgentId: mutantId,
      originalPlasmidId: plasmidId,
      newPlasmidId,
      scores: { mutant: mutantScore, baseline: baselineScore },
      baselineId,
      mutantId
    };
  }

  // Baseline retenue : apoptose de la branche mutante
  await db.run("UPDATE agents SET status = 'completed' WHERE id = ?", baselineId).catch(() => {});
  await db.run("UPDATE agents SET status = 'apoptosis', is_apoptotic = 1 WHERE id = ?", mutantId).catch(() => {});

  telemetry.emitEvent({
    eventType: 'PLASMID_MUTATION_PRUNED',
    agentId: agentId,
    action: 'RETAIN_BASELINE_PLASMID',
    detail: `Baseline plasmid ${plasmidId} retained. Mutant ${mutantId} pruned (score ${mutantScore} <= ${baselineScore}).`,
    severity: 'info',
    payload: { plasmidId, retainedAgentId: baselineId, prunedAgentId: mutantId, scores: { mutantScore, baselineScore } }
  });

  return {
    success: true,
    branch: 'baseline_retained',
    winner: 'baseline',
    winningAgentId: baselineId,
    plasmidId,
    scores: { mutant: mutantScore, baseline: baselineScore },
    baselineId,
    mutantId
  };
}

module.exports = { mutate, breed, select, paretoSelect, speciation, plasmidDivergence };

