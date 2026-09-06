/**
 * GenOS Genetics & Genome Service
 * Phylogenetic mutation tree, allele frequency analysis, and genetic crossover synthesizer.
 */

const { getDatabase } = require('../db');
const crypto = require('crypto');

function deterministicUnit(seed) {
  const digest = crypto.createHash('sha256').update(String(seed)).digest();
  return digest.readUInt32BE(0) / 0x100000000;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function contentFingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function validateCognitiveGenes(genes, label = 'genome') {
  if (!genes || typeof genes !== 'object') throw new TypeError(`${label} genes are required.`);
  if (typeof genes.role !== 'string' || !genes.role.trim()) throw new TypeError(`${label}.role must be a non-empty string.`);
  if (typeof genes.strategy !== 'string' || !genes.strategy.trim()) throw new TypeError(`${label}.strategy must be a non-empty string.`);
  if (!Array.isArray(genes.tools) || !genes.tools.length || genes.tools.some((tool) => typeof tool !== 'string' || !tool.trim())) {
    throw new TypeError(`${label}.tools must contain at least one non-empty tool name.`);
  }
  for (const key of ['temp', 'topP']) {
    if (!Number.isFinite(Number(genes[key])) || Number(genes[key]) < 0 || Number(genes[key]) > 1) {
      throw new RangeError(`${label}.${key} must be a finite value in [0, 1].`);
    }
  }
}

// Baseline evolutionary tree so fresh installs still render a meaningful DAG.
const SEED_TREE_NODES = [
  { id: 'node-root', label: 'GenOS Master DAG Root', node_type: 'core', score: 1.0, state_summary: 'Root commit', metadata: { generation: 0, status: 'core' } },
  { id: 'node-arch', label: 'Architecture Node', node_type: 'checkpoint', score: 0.94, state_summary: 'Modular backend', metadata: { generation: 0, status: 'checkpoint' } },
  { id: 'node-worker-genesis', label: 'Worker Genesis', node_type: 'mutation', score: 0.88, state_summary: 'Initial worker lineage', metadata: { generation: 1, status: 'active', mutationType: 'genesis' } }
];
const SEED_TREE_EDGES = [
  { id: 'edge-root-arch', source_node_id: 'node-root', target_node_id: 'node-arch', edge_type: 'lineage' },
  { id: 'edge-root-worker', source_node_id: 'node-root', target_node_id: 'node-worker-genesis', edge_type: 'mutation' }
];

const SEED_DECISIONS = [
  { id: 'decision-seed-guard-clauses', title: 'Guard clauses over nesting', category: 'Heuristics', content: 'Prefer early returns to keep mission prompts flat and auditable.', created_at: null },
  { id: 'decision-seed-checkpoints', title: 'Checkpoint before mutation', category: 'Resilience', content: 'Snapshot workspace state before applying any genome mutation.', created_at: null },
  { id: 'decision-seed-scoped-tools', title: 'Least-privilege tool equip', category: 'Security', content: 'Equip agents with the minimal tool set their strategy requires.', created_at: null }
];

/**
 * Builds the phylogenetic mutation tree (evolutionary DAG)
 */
async function getPhylogeneticTree(workspaceId) {
  const db = await getDatabase();
  const rows = await db.all('SELECT * FROM lineage_nodes WHERE workspace_id = ? ORDER BY created_at ASC', workspaceId);
  const edgeRows = rows.length > 0
    ? await db.all('SELECT * FROM lineage_edges WHERE workspace_id = ?', workspaceId)
    : SEED_TREE_EDGES;
  const sourceRows = rows.length > 0 ? rows : SEED_TREE_NODES;
  const parentsByChild = new Map();
  for (const edge of edgeRows) {
    if (!parentsByChild.has(edge.target_node_id)) {
      parentsByChild.set(edge.target_node_id, []);
    }
    parentsByChild.get(edge.target_node_id).push(edge.source_node_id);
  }
  const nodes = sourceRows.map((row) => {
    let metadata = {};
    let metadataCorrupt = false;
    try {
      metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {});
    } catch {
      metadataCorrupt = true;
    }
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
  });
  const edges = edgeRows.map((row) => ({
    id: row.id,
    source: row.source_node_id,
    target: row.target_node_id,
    mutationType: row.edge_type
  }));

  return {
    workspaceId,
    timestamp: new Date().toISOString(),
    totalGenerations: nodes.reduce((max, node) => Math.max(max, node.generation), 0),
    nodeCount: nodes.length,
    championNode: nodes.find(n => n.status === 'CHAMPION'),
    nodes,
    edges
  };
}

/**
 * Mines allele and gene frequencies from trajectories and decisions
 */
async function analyzeAlleles(scope = {}) {
  const db = await getDatabase();
  const scoped = scope.organizationId && scope.projectId;
  let decisions = await db.all(
    scoped
      ? 'SELECT id, title, category, content, created_at FROM genome_decisions WHERE organization_id = ? AND project_id = ? ORDER BY created_at ASC'
      : 'SELECT id, title, category, content, created_at FROM genome_decisions ORDER BY created_at ASC',
    ...(scoped ? [scope.organizationId, scope.projectId] : [])
  );
  if (decisions.length === 0) {
    // Baseline gene pool for fresh installs so the analyzer has candidates.
    decisions = SEED_DECISIONS;
  }
  const allAlleles = decisions.map((decision) => ({
    id: decision.id,
    name: decision.title,
    category: decision.category,
    type: 'RECORDED',
    content: decision.content,
    createdAt: decision.created_at
  }));

  const lineage = await db.all(
    scoped
      ? 'SELECT n.score, n.state_summary, n.metadata FROM lineage_nodes n JOIN workspaces w ON w.id = n.workspace_id WHERE n.node_type = ? AND w.organization_id = ? AND w.project_id = ?'
      : 'SELECT score, state_summary, metadata FROM lineage_nodes WHERE node_type = ?',
    ...(scoped ? ['agent', scope.organizationId, scope.projectId] : ['agent'])
  );
  const scoredCount = lineage.filter((n) => n.score !== null).length;
  const highFitnessCount = lineage.filter((n) => Number(n.score) >= 0.7).length;
  const correlation = scoredCount > 0 ? Number((highFitnessCount / scoredCount).toFixed(2)) : 0.85;
  const geneStats = new Map();
  for (const row of lineage) {
    let genes = {};
    try { genes = JSON.parse(row.metadata || '{}').genes || {}; } catch (_) {}
    for (const [gene, value] of Object.entries(genes)) {
      const key = `${gene}=${JSON.stringify(value)}`;
      const stat = geneStats.get(key) || { gene, value, count: 0, highFitness: 0, lowFitness: 0 };
      stat.count += 1;
      if (Number(row.score) >= 0.7) stat.highFitness += 1;
      if (Number(row.score) < 0.3) stat.lowFitness += 1;
      geneStats.set(key, stat);
    }
  }
  const geneFrequencyMatrix = [...geneStats.values()].map((stat) => ({
    alleleId: `${stat.gene}:${JSON.stringify(stat.value)}`,
    name: stat.gene,
    value: stat.value,
    count: stat.count,
    successCorrelation: Number((stat.highFitness / stat.count).toFixed(2)),
    status: stat.highFitness >= stat.lowFitness ? 'BENEFICIAL_CANDIDATE' : 'DETRIMENTAL_CANDIDATE'
  }));
  const beneficial = geneFrequencyMatrix.filter((gene) => gene.status === 'BENEFICIAL_CANDIDATE');
  const lethal = geneFrequencyMatrix.filter((gene) => gene.status === 'DETRIMENTAL_CANDIDATE');

  return {
    timestamp: new Date().toISOString(),
    totalAllelesTracked: allAlleles.length,
    dominantBeneficialGenes: beneficial,
    lethalDetrimentalGenes: lethal,
    unclassifiedAlleles: allAlleles,
    analysisBasis: scoredCount > 0 ? 'lineage-and-recorded-decisions' : 'recorded-decisions-only',
    selectionAnalysisAvailable: scoredCount > 0,
    geneFrequencyMatrix: [...allAlleles.map(a => ({
      alleleId: a.id,
      name: a.name,
      category: a.category,
      successCorrelation: correlation,
      status: a.type
    })), ...geneFrequencyMatrix]
  };
}

/**
 * Performs genetic crossover recombination between two parent agent genomes
 */
function crossoverGenome(parentA, parentB, options = {}) {
  const resolvedA = parentA;
  const resolvedB = parentB;
  const strategy = options.strategy || 'uniform'; // single_point, multi_point, uniform
  if (!['single_point', 'multi_point', 'uniform'].includes(strategy)) {
    throw new RangeError(`Unsupported crossover strategy '${strategy}'.`);
  }
  const mutationRate = options.mutationRate === undefined ? 0.05 : Number(options.mutationRate);
  if (!Number.isFinite(mutationRate) || mutationRate < 0 || mutationRate > 1) {
    throw new RangeError('mutationRate must be between 0 and 1');
  }

  if (!resolvedA?.genes || !resolvedB?.genes) {
    throw new Error('Two explicit parent genomes are required');
  }
  validateCognitiveGenes(resolvedA.genes, 'parentA');
  validateCognitiveGenes(resolvedB.genes, 'parentB');
  const pA = resolvedA;
  const pB = resolvedB;
  const toolsA = Array.isArray(pA.genes.tools) ? pA.genes.tools : [];
  const toolsB = Array.isArray(pB.genes.tools) ? pB.genes.tools : [];

  const childGenes = {};
  const geneKeys = ['role', 'strategy', 'tools', 'temp', 'topP'];
    const mutationSeed = options.seed === undefined
      ? `${pA.name || 'A'}:${pB.name || 'B'}:${strategy}:${mutationRate}`
      : String(options.seed);
    const childId = `agent-crossover-${crypto.randomUUID()}`;
  const parentFingerprint = `${contentFingerprint(pA.genes)}:${contentFingerprint(pB.genes)}`;
  const reproducibilitySeed = options.seed === undefined
    ? contentFingerprint({ version: 'genos-crossover-v1', parentFingerprint, strategy })
    : String(options.seed);

  // Crossover recombine logic
  for (let i = 0; i < geneKeys.length; i++) {
    const key = geneKeys[i];
    let pickA = true;

    if (strategy === 'single_point') {
      const split = Number.isInteger(options.crossoverPoint) ? options.crossoverPoint : 2;
      pickA = i < split;
    } else if (strategy === 'multi_point') {
      pickA = i % 2 === 0;
    } else {
      const swapThreshold = typeof options.swapProb === 'number' ? options.swapProb : 0.5;
      pickA = deterministicUnit(`${reproducibilitySeed}:locus:${key}`) >= swapThreshold;
    }

    if (key === 'tools') {
      const toolSet = new Set(pickA ? toolsA : toolsB);
      // Horizontal gene transfer
      if (deterministicUnit(`${reproducibilitySeed}:horizontal-tools`) < 0.5) {
        toolSet.add(toolsB[0] || 'genos_inspect');
      }
      childGenes.tools = Array.from(toolSet);
    } else {
      childGenes[key] = pickA ? pA.genes[key] : pB.genes[key];
    }
  }

  // Multi-locus mutation if triggered
  const appliedMutations = [];
  if (deterministicUnit(`${reproducibilitySeed}:mutation`) < mutationRate) {
    // 1. Temperature mutation (bidirectional step)
    const tempUnit = deterministicUnit(`${reproducibilitySeed}:mutation:temp_direction`);
    const tempDelta = tempUnit < 0.5 ? -0.05 : 0.05;
    const oldTemp = Number(childGenes.temp);
    let newTemp = Number((oldTemp + tempDelta).toFixed(2));
    if (newTemp < 0.1) newTemp = 0.15;
    if (newTemp > 0.9) newTemp = 0.85;
    if (newTemp !== oldTemp) {
      childGenes.temp = newTemp;
      appliedMutations.push({
        gene: 'temp',
        from: oldTemp,
        to: newTemp,
        delta: `${newTemp >= oldTemp ? '+' : ''}${(newTemp - oldTemp).toFixed(2)}`
      });
    }

    // 2. topP mutation (probabilistic secondary locus)
    if (deterministicUnit(`${reproducibilitySeed}:mutation:topP`) < mutationRate * 0.8) {
      const oldTopP = Number(childGenes.topP);
      const topPDelta = deterministicUnit(`${reproducibilitySeed}:mutation:topP_dir`) < 0.5 ? -0.05 : 0.05;
      let newTopP = Number((oldTopP + topPDelta).toFixed(2));
      if (newTopP < 0.5) newTopP = 0.55;
      if (newTopP > 1.0) newTopP = 0.95;
      if (newTopP !== oldTopP) {
        childGenes.topP = newTopP;
        appliedMutations.push({
          gene: 'topP',
          from: oldTopP,
          to: newTopP,
          delta: `${newTopP >= oldTopP ? '+' : ''}${(newTopP - oldTopP).toFixed(2)}`
        });
      }
    }

    // 3. Tools mutation (gene drift on tools)
    if (deterministicUnit(`${reproducibilitySeed}:mutation:tools`) < mutationRate * 0.5) {
      const AVAILABLE_DISCOVERY_TOOLS = ['genos_inspect', 'genos_patch', 'genos_test', 'genos_storage', 'genos_ais_prr_scan', 'genos_snapshot'];
      const toolIdx = Math.floor(deterministicUnit(`${reproducibilitySeed}:mutation:tool_choice`) * AVAILABLE_DISCOVERY_TOOLS.length);
      const candidateTool = AVAILABLE_DISCOVERY_TOOLS[toolIdx];
      if (!childGenes.tools.includes(candidateTool)) {
        const oldTools = [...childGenes.tools];
        childGenes.tools.push(candidateTool);
        appliedMutations.push({
          gene: 'tools',
          from: oldTools,
          to: childGenes.tools,
          delta: `+${candidateTool}`
        });
      }
    }
  }

  const predictedFitness = Number(Math.min(99.0, 88.0 + (1 - childGenes.temp) * 8 + (childGenes.tools.length >= 3 ? 3 : 0)).toFixed(1));

  return {
    childId,
    reproducibilitySeed,
    parentFingerprint,
    genomeHash: contentFingerprint(childGenes),
    crossoverStrategy: strategy,
    mutationRateApplied: mutationRate,
    parents: {
      parentA: pA.name || 'Parent A',
      parentB: pB.name || 'Parent B'
    },
    childGenes,
    mutations: appliedMutations,
    predictedFitnessScore: predictedFitness,
    predictedFitnessBasis: 'heuristic',
    provingGroundStatus: 'UNVALIDATED_HEURISTIC'
  };
}

/**
 * Somatic Hypermutation: accelerates mutation rate across cognitive loci
 * under severe stress, stagnation, or circuit breaker trips.
 */
function somaticHypermutate(genes = {}, options = {}) {
  validateCognitiveGenes(genes, 'somaticHypermutate');
  const stressLevel = Math.max(0.1, Math.min(2.0, Number(options.stressLevel ?? 1.0)));
  const baseRate = Math.max(0.1, Math.min(1.0, Number(options.mutationRate ?? 0.4)));
  const effectiveRate = Math.min(1.0, baseRate * stressLevel);
  const seed = options.seed ? String(options.seed) : `hyper_${Date.now()}_${Math.random()}`;

  const mutatedGenes = {
    ...genes,
    tools: [...(genes.tools || [])]
  };
  const mutationsApplied = [];

  // 1. Reheat Temperature
  const oldTemp = Number(mutatedGenes.temp);
  const reheatDelta = ((deterministicUnit(`${seed}:hyper:temp`) * 0.35 + 0.1) * stressLevel);
  let newTemp = Number((Math.min(0.95, Math.max(0.1, oldTemp + (deterministicUnit(`${seed}:hyper:dir`) < 0.3 ? -reheatDelta * 0.5 : reheatDelta)))).toFixed(2));
  if (newTemp !== oldTemp) {
    mutatedGenes.temp = newTemp;
    mutationsApplied.push({ gene: 'temp', from: oldTemp, to: newTemp, reason: 'thermal_reheat' });
  }

  // 2. Perturb topP
  const oldTopP = Number(mutatedGenes.topP);
  const topPShift = (deterministicUnit(`${seed}:hyper:topP`) < 0.5 ? -0.1 : 0.1);
  let newTopP = Number((Math.min(1.0, Math.max(0.5, oldTopP + topPShift))).toFixed(2));
  if (newTopP !== oldTopP) {
    mutatedGenes.topP = newTopP;
    mutationsApplied.push({ gene: 'topP', from: oldTopP, to: newTopP, reason: 'stochastic_breadth' });
  }

  // 3. Diversify tools
  const ADAPTIVE_EXPLORATION_TOOLS = ['genos_inspect', 'genos_patch', 'genos_test', 'genos_storage', 'genos_ais_prr_scan', 'genos_snapshot'];
  const missingTools = ADAPTIVE_EXPLORATION_TOOLS.filter(t => !mutatedGenes.tools.includes(t));
  if (missingTools.length > 0 && deterministicUnit(`${seed}:hyper:tool`) < effectiveRate) {
    const chosenTool = missingTools[Math.floor(deterministicUnit(`${seed}:hyper:tool_pick`) * missingTools.length)];
    mutatedGenes.tools.push(chosenTool);
    mutationsApplied.push({ gene: 'tools', action: 'add', tool: chosenTool, reason: 'repertoire_expansion' });
  }

  // 4. Strategy mutation (exploration mode)
  if (deterministicUnit(`${seed}:hyper:strat`) < effectiveRate * 0.6) {
    const STRATEGY_POOL = ['tree-search', 'dialectic-exploration', 'adversarial-falsification', 'invariant-verification'];
    const candidates = STRATEGY_POOL.filter(s => s !== mutatedGenes.strategy);
    const chosenStrat = candidates[Math.floor(deterministicUnit(`${seed}:hyper:strat_pick`) * candidates.length)];
    if (chosenStrat) {
      const oldStrat = mutatedGenes.strategy;
      mutatedGenes.strategy = chosenStrat;
      mutationsApplied.push({ gene: 'strategy', from: oldStrat, to: chosenStrat, reason: 'mode_shift' });
    }
  }

  const hypermutationScore = Number((mutationsApplied.length * 0.25 * stressLevel).toFixed(2));

  return {
    originalGenes: genes,
    mutatedGenes,
    mutationsApplied,
    stressLevel,
    effectiveRate,
    hypermutationScore,
    isHypermutated: mutationsApplied.length > 0
  };
}

module.exports = {
  getPhylogeneticTree,
  analyzeAlleles,
  crossoverGenome,
  somaticHypermutate,
  validateCognitiveGenes
};
