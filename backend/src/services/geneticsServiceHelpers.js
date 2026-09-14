const {
  deterministicUnit,
  contentFingerprint,
  validateCognitiveGenes,
  SEED_DECISIONS
} = require('./geneticsConstants');

const ADAPTIVE_EXPLORATION_TOOLS = ['genos_inspect', 'genos_patch', 'genos_test', 'genos_storage', 'genos_ais_prr_scan', 'genos_snapshot'];

function buildParentIndex(edgeRows) {
  const parentsByChild = new Map();
  for (const edge of edgeRows) {
    if (!parentsByChild.has(edge.target_node_id)) {
      parentsByChild.set(edge.target_node_id, []);
    }
    parentsByChild.get(edge.target_node_id).push(edge.source_node_id);
  }
  return parentsByChild;
}

function readNodeMetadata(row) {
  let metadata = {};
  let metadataCorrupt = false;
  try {
    metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {});
  } catch {
    metadataCorrupt = true;
  }
  return { metadata, metadataCorrupt };
}

function buildTreeNode(row, parentsByChild) {
  const { metadata, metadataCorrupt } = readNodeMetadata(row);
  const childParents = parentsByChild.get(row.id) || [];
  return {
    id: row.id,
    parentId: childParents[0] || null,
    parentIds: childParents,
    isBiparental: childParents.length > 1,
    generation: metadata.generation ?? 0,
    name: row.label,
    genes: metadata.genes,
    fitnessScore: row.score === null || row.score === undefined ? null : Number(row.score) * 100,
    status: metadata.status || row.node_type,
    mutationType: metadata.mutationType,
    geneDiff: row.state_summary || '',
    color: metadata.color,
    metadataCorrupt
  };
}

function mapTreeEdge(row) {
  return {
    id: row.id,
    source: row.source_node_id,
    target: row.target_node_id,
    mutationType: row.edge_type
  };
}

async function collectDecisionAlleles(db, scope) {
  const scoped = scope.organizationId && scope.projectId;
  const sql = scoped
    ? 'SELECT id, title, category, content, created_at FROM genome_decisions WHERE organization_id = ? AND project_id = ? ORDER BY created_at ASC'
    : 'SELECT id, title, category, content, created_at FROM genome_decisions ORDER BY created_at ASC';
  const params = scoped ? [scope.organizationId, scope.projectId] : [];
  let decisions = await db.all(sql, ...params);
  if (decisions.length === 0) {
    decisions = SEED_DECISIONS;
  }
  const alleles = decisions.map((decision) => {
    return {
      id: decision.id,
      name: decision.title,
      category: decision.category,
      type: 'RECORDED',
      content: decision.content,
      createdAt: decision.created_at
    };
  });
  return { scoped, alleles };
}

async function collectLineageRows(db, scoped, scope) {
  const sql = scoped
    ? 'SELECT n.score, n.state_summary, n.metadata FROM lineage_nodes n JOIN workspaces w ON w.id = n.workspace_id WHERE n.node_type = ? AND w.organization_id = ? AND w.project_id = ?'
    : 'SELECT score, state_summary, metadata FROM lineage_nodes WHERE node_type = ?';
  const params = scoped ? ['agent', scope.organizationId, scope.projectId] : ['agent'];
  return db.all(sql, ...params);
}

function countScoredLineage(lineage) {
  const scoredCount = lineage.filter((row) => {
    return row.score !== null;
  }).length;
  const highFitnessCount = lineage.filter((row) => {
    return Number(row.score) >= 0.7;
  }).length;
  const correlation = scoredCount > 0 ? Number((highFitnessCount / scoredCount).toFixed(2)) : 0.85;
  return { scoredCount, highFitnessCount, correlation };
}

function buildGeneStats(lineage) {
  const geneStats = new Map();
  for (const row of lineage) {
    let genes = {};
    try {
      genes = JSON.parse(row.metadata || '{}').genes || {};
    } catch {
      genes = {};
    }
    for (const [gene, value] of Object.entries(genes)) {
      const key = `${gene}=${JSON.stringify(value)}`;
      const stat = geneStats.get(key) || { gene, value, count: 0, highFitness: 0, lowFitness: 0 };
      stat.count += 1;
      if (Number(row.score) >= 0.7) stat.highFitness += 1;
      if (Number(row.score) < 0.3) stat.lowFitness += 1;
      geneStats.set(key, stat);
    }
  }
  return geneStats;
}

function buildGeneFrequencyMatrix(geneStats) {
  return [...geneStats.values()].map((stat) => {
    return {
      alleleId: `${stat.gene}:${JSON.stringify(stat.value)}`,
      name: stat.gene,
      value: stat.value,
      count: stat.count,
      successCorrelation: Number((stat.highFitness / stat.count).toFixed(2)),
      status: stat.highFitness >= stat.lowFitness ? 'BENEFICIAL_CANDIDATE' : 'DETRIMENTAL_CANDIDATE'
    };
  });
}

function requireParentGenes(parentA, parentB) {
  if (!parentA || !parentA.genes || !parentB || !parentB.genes) {
    throw new Error('Two explicit parent genomes are required');
  }
}

function resolveCrossoverOptions(options) {
  const strategy = options.strategy || 'uniform';
  if (!['single_point', 'multi_point', 'uniform'].includes(strategy)) {
    throw new RangeError(`Unsupported crossover strategy '${strategy}'.`);
  }
  const mutationRate = options.mutationRate === undefined ? 0.05 : Number(options.mutationRate);
  if (!Number.isFinite(mutationRate) || mutationRate < 0 || mutationRate > 1) {
    throw new RangeError('mutationRate must be between 0 and 1');
  }
  return { strategy, mutationRate };
}

function buildCrossoverContext(parentA, parentB, options) {
  const { strategy, mutationRate } = resolveCrossoverOptions(options);
  requireParentGenes(parentA, parentB);
  validateCognitiveGenes(parentA.genes, 'parentA');
  validateCognitiveGenes(parentB.genes, 'parentB');
  const toolsA = Array.isArray(parentA.genes.tools) ? parentA.genes.tools : [];
  const toolsB = Array.isArray(parentB.genes.tools) ? parentB.genes.tools : [];
  const parentFingerprint = `${contentFingerprint(parentA.genes)}:${contentFingerprint(parentB.genes)}`;
  const reproducibilitySeed = options.seed === undefined
    ? contentFingerprint({ version: 'genos-crossover-v1', parentFingerprint, strategy })
    : String(options.seed);
  return {
    strategy,
    mutationRate,
    toolsA,
    toolsB,
    parentFingerprint,
    reproducibilitySeed,
    crossoverPoint: options.crossoverPoint,
    swapProb: options.swapProb
  };
}

function pickLocus(key, index, context) {
  if (context.strategy === 'single_point') {
    const split = Number.isInteger(context.crossoverPoint) ? context.crossoverPoint : 2;
    return index < split;
  }
  if (context.strategy === 'multi_point') {
    return index % 2 === 0;
  }
  const swapThreshold = typeof context.swapProb === 'number' ? context.swapProb : 0.5;
  return deterministicUnit(`${context.reproducibilitySeed}:locus:${key}`) >= swapThreshold;
}

function recombineTools(pickA, context) {
  const toolSet = new Set(pickA ? context.toolsA : context.toolsB);
  const donorTools = pickA ? context.toolsB : context.toolsA;
  if (deterministicUnit(`${context.reproducibilitySeed}:horizontal-tools`) < 0.5) {
    toolSet.add(donorTools[0] || 'genos_inspect');
  }
  return Array.from(toolSet);
}

function mutateTemperature(childGenes, context) {
  const seed = context.reproducibilitySeed;
  const tempUnit = deterministicUnit(`${seed}:mutation:temp_direction`);
  const tempDelta = tempUnit < 0.5 ? -0.05 : 0.05;
  const oldTemp = Number(childGenes.temp);
  let newTemp = Number((oldTemp + tempDelta).toFixed(2));
  if (newTemp < 0.1) newTemp = 0.15;
  if (newTemp > 0.9) newTemp = 0.85;
  if (newTemp === oldTemp) {
    return null;
  }
  childGenes.temp = newTemp;
  return {
    gene: 'temp',
    from: oldTemp,
    to: newTemp,
    delta: `${newTemp >= oldTemp ? '+' : ''}${(newTemp - oldTemp).toFixed(2)}`
  };
}

function mutateTopP(childGenes, context) {
  const seed = context.reproducibilitySeed;
  if (deterministicUnit(`${seed}:mutation:topP`) >= context.mutationRate * 0.8) {
    return null;
  }
  const oldTopP = Number(childGenes.topP);
  const topPDelta = deterministicUnit(`${seed}:mutation:topP_dir`) < 0.5 ? -0.05 : 0.05;
  let newTopP = Number((oldTopP + topPDelta).toFixed(2));
  if (newTopP < 0.5) newTopP = 0.55;
  if (newTopP > 1.0) newTopP = 0.95;
  if (newTopP === oldTopP) {
    return null;
  }
  childGenes.topP = newTopP;
  return {
    gene: 'topP',
    from: oldTopP,
    to: newTopP,
    delta: `${newTopP >= oldTopP ? '+' : ''}${(newTopP - oldTopP).toFixed(2)}`
  };
}

function mutateTools(childGenes, context) {
  const seed = context.reproducibilitySeed;
  if (deterministicUnit(`${seed}:mutation:tools`) >= context.mutationRate * 0.5) {
    return null;
  }
  const toolIdx = Math.floor(deterministicUnit(`${seed}:mutation:tool_choice`) * ADAPTIVE_EXPLORATION_TOOLS.length);
  const candidateTool = ADAPTIVE_EXPLORATION_TOOLS[toolIdx];
  if (childGenes.tools.includes(candidateTool)) {
    return null;
  }
  const oldTools = [...childGenes.tools];
  childGenes.tools.push(candidateTool);
  return {
    gene: 'tools',
    from: oldTools,
    to: childGenes.tools,
    delta: `+${candidateTool}`
  };
}

function applyCrossoverMutations(childGenes, context) {
  const appliedMutations = [];
  if (deterministicUnit(`${context.reproducibilitySeed}:mutation`) < context.mutationRate) {
    const tempMutation = mutateTemperature(childGenes, context);
    if (tempMutation) appliedMutations.push(tempMutation);
    const topPMutation = mutateTopP(childGenes, context);
    if (topPMutation) appliedMutations.push(topPMutation);
    const toolMutation = mutateTools(childGenes, context);
    if (toolMutation) appliedMutations.push(toolMutation);
  }
  return appliedMutations;
}

function resolveHyperparameters(genes, options) {
  const stressLevel = Math.max(0.1, Math.min(2.0, Number(options.stressLevel ?? 1.0)));
  const baseRate = Math.max(0.1, Math.min(1.0, Number(options.mutationRate ?? 0.4)));
  const effectiveRate = Math.min(1.0, baseRate * stressLevel);
  const seed = options.seed
    ? String(options.seed)
    : `hyper_${contentFingerprint({ genes, stressLevel, baseRate })}`;
  return { stressLevel, baseRate, effectiveRate, seed };
}

function reheatTemperature(mutatedGenes, context) {
  const { seed, stressLevel } = context;
  const oldTemp = Number(mutatedGenes.temp);
  const reheatDelta = ((deterministicUnit(`${seed}:hyper:temp`) * 0.35 + 0.1) * stressLevel);
  const direction = deterministicUnit(`${seed}:hyper:dir`) < 0.3 ? -reheatDelta * 0.5 : reheatDelta;
  const newTemp = Number((Math.min(0.95, Math.max(0.1, oldTemp + direction))).toFixed(2));
  if (newTemp === oldTemp) {
    return null;
  }
  mutatedGenes.temp = newTemp;
  return { gene: 'temp', from: oldTemp, to: newTemp, reason: 'thermal_reheat' };
}

function perturbTopP(mutatedGenes, context) {
  const { seed } = context;
  const oldTopP = Number(mutatedGenes.topP);
  const topPShift = deterministicUnit(`${seed}:hyper:topP`) < 0.5 ? -0.1 : 0.1;
  const newTopP = Number((Math.min(1.0, Math.max(0.5, oldTopP + topPShift))).toFixed(2));
  if (newTopP === oldTopP) {
    return null;
  }
  mutatedGenes.topP = newTopP;
  return { gene: 'topP', from: oldTopP, to: newTopP, reason: 'stochastic_breadth' };
}

function diversifyTools(mutatedGenes, context) {
  const { seed, effectiveRate } = context;
  const missingTools = ADAPTIVE_EXPLORATION_TOOLS.filter((tool) => {
    return !mutatedGenes.tools.includes(tool);
  });
  if (missingTools.length === 0 || deterministicUnit(`${seed}:hyper:tool`) >= effectiveRate) {
    return null;
  }
  const pick = Math.floor(deterministicUnit(`${seed}:hyper:tool_pick`) * missingTools.length);
  const chosenTool = missingTools[pick];
  mutatedGenes.tools.push(chosenTool);
  return { gene: 'tools', action: 'add', tool: chosenTool, reason: 'repertoire_expansion' };
}

function mutateStrategy(mutatedGenes, context) {
  const { seed, effectiveRate } = context;
  if (deterministicUnit(`${seed}:hyper:strat`) >= effectiveRate * 0.6) {
    return null;
  }
  const pool = ['tree-search', 'dialectic-exploration', 'adversarial-falsification', 'invariant-verification'];
  const candidates = pool.filter((candidate) => {
    return candidate !== mutatedGenes.strategy;
  });
  const chosenStrat = candidates[Math.floor(deterministicUnit(`${seed}:hyper:strat_pick`) * candidates.length)];
  if (!chosenStrat) {
    return null;
  }
  const oldStrat = mutatedGenes.strategy;
  mutatedGenes.strategy = chosenStrat;
  return { gene: 'strategy', from: oldStrat, to: chosenStrat, reason: 'mode_shift' };
}

module.exports = {
  buildParentIndex,
  buildTreeNode,
  mapTreeEdge,
  collectDecisionAlleles,
  collectLineageRows,
  countScoredLineage,
  buildGeneStats,
  buildGeneFrequencyMatrix,
  buildCrossoverContext,
  pickLocus,
  recombineTools,
  applyCrossoverMutations,
  resolveHyperparameters,
  reheatTemperature,
  perturbTopP,
  diversifyTools,
  mutateStrategy
};
