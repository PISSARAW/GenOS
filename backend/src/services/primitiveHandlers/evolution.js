/**
 * Lot 3 : Primitives d'Évolution (mutate, breed, select, pareto, speciation)
 */
const telemetry = require('../telemetryObserver');
const { getDatabase } = require('../../db');
const geneticsService = require('../geneticsService');
const agentEvolutionService = require('../agentEvolutionService');
const genosCli = require('../genosCli');
const crypto = require('crypto');

const MUTABLE_GENES = new Set(['role', 'strategy', 'tools', 'temp', 'topP']);

function boundedPercentage(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
}

function applyMutationDescriptors(genes, descriptors) {
  const nextGenes = { ...genes, tools: [...(genes.tools || [])] };
  const applied = [];
  const rejected = [];
  for (const descriptor of descriptors) {
    const match = typeof descriptor === 'object' ? null : String(descriptor).match(/^([A-Za-z][\w]*)\s*=\s*(.+)$/);
    const gene = typeof descriptor === 'object' ? descriptor?.gene : match?.[1];
    const rawValue = typeof descriptor === 'object' ? (descriptor?.value ?? descriptor?.newValue) : match?.[2];
    if (!MUTABLE_GENES.has(gene) || rawValue === undefined) {
      rejected.push(String(descriptor));
      continue;
    }
    const previousValue = nextGenes[gene];
    if (gene === 'tools') {
      nextGenes.tools = Array.isArray(rawValue) ? rawValue.map(String) : String(rawValue).split(',').map((tool) => tool.trim()).filter(Boolean);
      if (!nextGenes.tools.length) {
        rejected.push(String(descriptor));
        continue;
      }
    } else if (gene === 'temp' || gene === 'topP') {
      const value = Number(rawValue);
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        rejected.push(String(descriptor));
        continue;
      }
      nextGenes[gene] = value;
    } else if (String(rawValue).trim()) {
      nextGenes[gene] = String(rawValue).trim();
    } else {
      rejected.push(String(descriptor));
      continue;
    }
    if (JSON.stringify(previousValue) === JSON.stringify(nextGenes[gene])) {
      rejected.push(String(descriptor));
      continue;
    }
    applied.push({ gene, value: nextGenes[gene] });
  }
  return { genes: nextGenes, applied, rejected };
}

async function mutate(context) {
  const db = await getDatabase();
  const agentId = context.agentId || context.orchestratorId;
  if (!agentId) {
    return { success: false, error: 'agentId required for mutation.' };
  }
  const parent = await db.get('SELECT id, name, role, current_task, workspace_id, model_tier FROM agents WHERE id = ?', agentId);
  if (!parent) {
    return { success: false, error: 'Parent agent not found: ' + agentId };
  }
  const lineage = await db.get('SELECT metadata FROM lineage_nodes WHERE id = ? AND workspace_id = ?', agentId, parent.workspace_id);
  if (lineage?.metadata) {
    try {
      const metadata = JSON.parse(lineage.metadata);
      if (metadata.genes && typeof metadata.genes === 'object') parent.genes = metadata.genes;
    } catch (_) {
      return { success: false, error: `Parent genome metadata is invalid: ${agentId}` };
    }
  }
  const mutations = Array.isArray(context.mutations) ? context.mutations : [];
  if (mutations.length === 0) return { success: false, error: 'At least one mutation descriptor is required.' };
  const evolved = agentEvolutionService.evolveWorkerGenome(parent, { role: context.role || 'mutant' }, {
    strategy: context.strategy,
    crossoverStrategy: context.crossoverStrategy,
    mutationRate: context.mutationRate
  });
  const descriptorResult = applyMutationDescriptors(evolved.genes, mutations);
  if (descriptorResult.rejected.length > 0 || descriptorResult.applied.length === 0) {
    return {
      success: false,
      error: 'Mutation descriptors were invalid or produced no change.',
      rejectedMutations: descriptorResult.rejected
    };
  }
  const mutatedTask = (parent.current_task || 'task') + ' [MUTATION: ' + mutations.join('; ') + ']';
  const mutantId = 'mutant_' + crypto.randomUUID();
  await db.run('BEGIN');
  let lineageResult;
  try {
    await db.run(
      "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, model_tier, parent_agent_id, lineage_relation, current_task) VALUES (?, ?, 'mutant', 'idle', 'GenOS', 'worker', ?, ?, ?, 'mutation', ?)",
      mutantId, 'Mutant of ' + agentId, parent.workspace_id, parent.model_tier || 'standard', agentId, mutatedTask
    );
    lineageResult = await agentEvolutionService.recordWorkerLineage(
      db,
      { agentId: mutantId, workspaceId: parent.workspace_id, name: 'Mutant of ' + agentId, role: 'mutant' },
      { parentId: agentId, genes: descriptorResult.genes, mutations: [...mutations, ...evolved.mutations, ...descriptorResult.applied], predictedFitness: evolved.predictedFitness }
    );
    if (!lineageResult.success) throw new Error(`Mutation lineage persistence failed: ${lineageResult.error}`);
    await db.run('COMMIT');
  } catch (error) {
    await db.run('ROLLBACK').catch(() => {});
    return { success: false, error: error.message };
  }
  telemetry.emitEvent({
    eventType: 'EVOLUTION_MUTATION',
    agentId: agentId,
    action: 'MUTATE',
    detail: 'Created mutant ' + mutantId + ' with perturbation: ' + mutations.join('; '),
    severity: 'info',
    payload: { mutantId, mutations, appliedMutations: descriptorResult.applied, genes: descriptorResult.genes, predictedFitness: evolved.predictedFitness }
  });
  return { success: true, mutantId, mutatedTask, genes: descriptorResult.genes, appliedMutations: descriptorResult.applied, predictedFitness: evolved.predictedFitness };
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
  if (rowA.workspace_id !== rowB.workspace_id) {
    return { success: false, error: 'Parents must belong to the same workspace.' };
  }
  if (context.workspaceId && rowA.workspace_id !== context.workspaceId) {
    return { success: false, error: 'Parent workspace does not match the requested workspace.' };
  }

  // 1. Recombinaison méiotique des gènes cognitifs (stratégie, outils, hyperparamètres)
  const persistedGenes = async (row) => {
    const lineage = await db.get('SELECT metadata FROM lineage_nodes WHERE id = ?', row.id);
    try {
      const genes = lineage?.metadata ? JSON.parse(lineage.metadata).genes : null;
      return genes && typeof genes === 'object' ? genes : {};
    } catch (_) { return {}; }
  };
  const genomeForAgent = (row, genes) => ({
    id: row.id,
    name: row.name,
    genes: {
      role: row.role || 'worker',
      strategy: row.role || 'adaptive-hybrid',
      tools: ['genos_inspect'],
      temp: 0.5,
      topP: 0.9,
      ...genes,
      tools: Array.isArray(genes.tools) ? genes.tools : ['genos_inspect']
    }
  });
  const genomeA = genomeForAgent(rowA, await persistedGenes(rowA));
  const genomeB = genomeForAgent(rowB, await persistedGenes(rowB));
  const crossoverStrategy = context.strategy || 'uniform';
  const mutationRate = context.mutationRate ?? 0.05;
  const swapProb = context.swapProb ?? 0.5;
  const crossoverPoint = context.crossoverPoint;
  const crossoverSeed = context.seed === undefined
    ? `${parentA}:${parentB}:${crossoverStrategy}:${mutationRate}:${swapProb}:${crossoverPoint ?? 'uniform'}`
    : String(context.seed);
  const childRecomb = geneticsService.crossoverGenome(genomeA, genomeB, {
    strategy: crossoverStrategy,
    mutationRate,
    swapProb,
    crossoverPoint,
    seed: crossoverSeed
  });

  // 2. Recombinaison native méiotique Rust via crates/genos-reproduction
  let nativeRecomb = null;
  try {
    const cliRun = await genosCli.runCrossover({
      parentA: rowA.id,
      parentB: rowB.id,
      swapProb,
      crossoverPoint,
      speciationThreshold: context.speciationThreshold,
      genesA: genomeA.genes,
      genesB: genomeB.genes,
      seed: crossoverSeed
    });
    if (cliRun.json && cliRun.json.success === false) {
      return { success: false, error: cliRun.json.error || 'Speciation barrier exceeded: parents cannot interbreed.' };
    }
    if (cliRun.ok && cliRun.json) {
      nativeRecomb = cliRun.json;
    }
  } catch (error) {
    return { success: false, error: `Native crossover failed: ${error.message}` };
  }
  if (!nativeRecomb) {
    return { success: false, error: 'Native crossover returned no result.' };
  }

  const strategy = childRecomb.childGenes?.strategy || 'adaptive-hybrid';
  const tools = childRecomb.childGenes?.tools || ['genos_inspect'];
  const crossoverTask = `${rowA.name || parentA} (${rowA.role || 'worker'}) x ${rowB.name || parentB} (${rowB.role || 'worker'}) -> Strategy: ${strategy}. Tools: [${tools.join(', ')}]. Mission: ${rowA.current_task || 'collaborative mission'}`;

  const childId = childRecomb.childId || `child_${crypto.randomUUID()}`;
  await db.run(
    "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, model_tier, parent_agent_id, lineage_relation, current_task) VALUES (?, ?, 'offspring', 'idle', 'GenOS', 'worker', ?, ?, ?, 'crossover', ?)",
    childId, 'Offspring of ' + (rowA.name || parentA) + ' x ' + (rowB.name || parentB), rowA.workspace_id, rowA.model_tier || 'standard', parentA, crossoverTask
  );
  const lineageResult = await agentEvolutionService.recordWorkerLineage(db, {
    agentId: childId,
    workspaceId: rowA.workspace_id,
    name: 'Offspring of ' + (rowA.name || parentA) + ' x ' + (rowB.name || parentB),
    role: 'offspring'
  }, {
    parentIds: [parentA, parentB],
    parents: { parentA: rowA.id, parentB: rowB.id },
    genes: childRecomb.childGenes,
    mutations: childRecomb.mutations,
    predictedFitness: childRecomb.predictedFitnessScore,
    reproduction: {
      engine: 'javascript_genome_authority',
      strategy: crossoverStrategy,
      mutationRate,
      swapProb,
      crossoverPoint: crossoverPoint ?? null,
      seed: crossoverSeed,
      parentFingerprint: childRecomb.parentFingerprint,
      genomeHash: childRecomb.genomeHash,
      nativeRecombination: nativeRecomb
    }
  });
  if (!lineageResult.success) {
    await db.run('DELETE FROM agents WHERE id = ?', childId);
    return { success: false, error: `Breeding lineage persistence failed: ${lineageResult.error}` };
  }

  telemetry.emitEvent({
    eventType: 'EVOLUTION_BREED',
    agentId: parentA,
    action: 'BREED',
    detail: 'Bred child ' + childId + ' via Meiotic Crossover: predicted fitness ' + childRecomb.predictedFitnessScore,
    severity: 'info',
    payload: {
      childId, parentA, parentB,
      childGenes: childRecomb.childGenes,
      predictedFitnessScore: childRecomb.predictedFitnessScore,
      fitnessStatus: 'unvalidated',
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
    predictedFitnessScore: childRecomb.predictedFitnessScore,
    fitnessStatus: 'unvalidated',
    nativeRecombination: nativeRecomb,
      reproducibility: {
        seed: crossoverSeed,
        parentFingerprint: childRecomb.parentFingerprint,
        genomeHash: childRecomb.genomeHash,
        engine: 'javascript_genome_authority'
      },
  };
}

async function select(context) {
  const db = await getDatabase();
  const candidates = (context.candidates || []).map((candidate) => {
    const id = typeof candidate === 'string' ? candidate : candidate?.id;
    return { id, input: candidate };
  }).filter((candidate) => candidate.id);
  if (candidates.length === 0) {
    return { success: false, error: 'No candidates provided for selection.' };
  }
  const scored = [];
  for (const candidate of candidates) {
    const row = context.workspaceId
      ? await db.get('SELECT a.id, a.status, a.current_task, l.score AS lineage_score FROM agents a LEFT JOIN lineage_nodes l ON l.id = a.id WHERE a.id = ? AND a.workspace_id = ?', candidate.id, context.workspaceId)
      : await db.get('SELECT a.id, a.status, a.current_task, l.score AS lineage_score FROM agents a LEFT JOIN lineage_nodes l ON l.id = a.id WHERE a.id = ?', candidate.id);
    if (!row) continue;
    const inputFitness = Number(candidate.input?.fitnessScore ?? candidate.input?.score);
    const fitnessScore = boundedPercentage(Number.isFinite(inputFitness) ? inputFitness : Number(row.lineage_score || 0) * 100);
    const evidenceScore = boundedPercentage(candidate.input?.evidenceScore);
    const statusScore = row.status === 'completed' ? 10 : (row.status === 'running' ? 5 : 0);
    const score = statusScore + (fitnessScore * 0.7) + (evidenceScore * 0.3);
    scored.push({ id: candidate.id, status: row.status, fitnessScore, evidenceScore, score });
  }
  const uniqueScored = [...scored.reduce((byId, candidate) => {
    const previous = byId.get(candidate.id);
    if (!previous || candidate.score > previous.score) byId.set(candidate.id, candidate);
    return byId;
  }, new Map()).values()];
  uniqueScored.sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
  const winner = uniqueScored[0] || null;
  const losers = uniqueScored.slice(1).map(s => s.id);
  telemetry.emitEvent({
    eventType: 'EVOLUTION_SELECTION',
    agentId: context.orchestratorId || 'strategy_adapter',
    action: 'SELECT',
    detail: 'Selected winner ' + (winner ? winner.id : 'none') + ' from ' + candidates.length + ' candidates.',
    severity: 'info',
    payload: { winner, losers, scored: uniqueScored }
  });
  return { success: !!winner, winner, losers, scored: uniqueScored };
}

async function paretoSelect(context) {
  const candidates = context.candidates || [];
  const objectives = context.objectives || ['quality', 'cost'];
  const directions = context.directions || {};
  if (candidates.length === 0) {
    return { success: false, error: 'No candidates for Pareto selection.' };
  }
  const directionFor = (objective) => {
    const explicit = directions[objective];
    if (explicit !== undefined) {
      if (explicit !== 'min' && explicit !== 'max') throw new Error(`Direction for '${objective}' must be 'min' or 'max'.`);
      return explicit;
    }
    return /cost|latency|time|token|risk|error/i.test(objective) ? 'min' : 'max';
  };
  const objectiveDirections = Object.fromEntries(objectives.map((objective) => [objective, directionFor(objective)]));
  const points = [];
  for (const [index, candidate] of candidates.entries()) {
    if (!candidate || typeof candidate !== 'object') return { success: false, error: `Candidate at index ${index} must be an object.` };
    const id = candidate.id || `candidate-${index}`;
    const scores = objectives.map((objective) => Number(candidate[objective]));
    if (scores.some((score) => !Number.isFinite(score))) {
      return { success: false, error: `Candidate '${id}' is missing a numeric Pareto score.` };
    }
    points.push({ id, key: `${id}#${index}`, scores });
  }
  const paretoFront = points.filter((point) => {
    return !points.some(other => {
      if (other.key === point.key) return false;
      const atLeastAsGood = other.scores.every((score, index) => objectiveDirections[objectives[index]] === 'min' ? score <= point.scores[index] : score >= point.scores[index]);
      const strictlyBetter = other.scores.some((score, index) => objectiveDirections[objectives[index]] === 'min' ? score < point.scores[index] : score > point.scores[index]);
      return atLeastAsGood && strictlyBetter;
    });
  });
  const dominated = points.filter(p => !paretoFront.some(f => f.key === p.key));
  telemetry.emitEvent({
    eventType: 'EVOLUTION_PARETO',
    agentId: context.orchestratorId || 'strategy_adapter',
    action: 'PARETO_SELECT',
    detail: 'Pareto front: ' + paretoFront.length + ' non-dominated / ' + points.length + ' total.',
    severity: 'info',
    payload: { paretoFront, dominated, objectives, directions: objectiveDirections }
  });
  return { success: paretoFront.length > 0, paretoFront, dominated, objectives, directions: objectiveDirections };
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
    } catch (error) {
      return { success: false, error: `Phylogeny divergence failed: ${error.message}` };
    }
    if (!phylogeneticDivergence) {
      return { success: false, error: 'Phylogeny divergence returned no result.' };
    }
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
  if (!parent) return { success: false, error: `Parent agent not found: ${agentId}` };
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
  if (!Number.isFinite(mutantScore) || !Number.isFinite(baselineScore)) {
    return { success: false, error: 'Mutant and baseline scores must be finite numbers.' };
  }
  const mutantPromoted = mutantScore > baselineScore || context.winner === 'mutant';

  let newPlasmidId = null;
  if (mutantPromoted) {
    newPlasmidId = `plasmid_v2_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newContent = context.candidatePlasmidCode || context.mutantSolution || `// Optimized mutant replacing ${plasmidId}\n// Goal: ${optimizationGoal}`;
    const float32 = new Float32Array(new Array(768).fill(0.0));
    const embeddingBuffer = Buffer.from(float32.buffer);
    await db.run(
      `INSERT INTO genome_decisions (id, title, content, created_by, category, synaptic_weight, embedding_blob, organization_id, project_id)
       VALUES (?, ?, ?, ?, 'Plasmid', 2.5, ?, ?, ?)`,
      newPlasmidId, `Plasmid Evolved (${plasmidName})`, newContent, mutantId, embeddingBuffer, context.organizationId || null, context.projectId || null
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

