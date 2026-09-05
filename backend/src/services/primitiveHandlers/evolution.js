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

module.exports = { mutate, breed, select, paretoSelect, speciation };
