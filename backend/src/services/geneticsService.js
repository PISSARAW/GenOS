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
  const parentByChild = new Map(edgeRows.map((edge) => [edge.target_node_id, edge.source_node_id]));
  const nodes = sourceRows.map((row) => {
    let metadata = {};
    let metadataCorrupt = false;
    try {
      metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {});
    } catch {
      metadataCorrupt = true;
    }
    return {
      id: row.id,
      parentId: parentByChild.get(row.id) || null,
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
      pickA = i < 2;
    } else if (strategy === 'multi_point') {
      pickA = i % 2 === 0;
    } else {
      pickA = deterministicUnit(`${reproducibilitySeed}:locus:${key}`) >= 0.5;
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

  // Apply mutation if triggered
  let mutatedGene = null;
  let mutationFrom = null;
  let mutationTo = null;
  if (deterministicUnit(`${reproducibilitySeed}:mutation`) < mutationRate) {
    mutationFrom = Number(childGenes.temp);
    mutationTo = Number((Math.min(0.8, mutationFrom + 0.05)).toFixed(2));
    if (mutationTo !== mutationFrom) {
      mutatedGene = 'temp';
      childGenes.temp = mutationTo;
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
    mutations: mutatedGene ? [{ gene: mutatedGene, from: mutationFrom, to: mutationTo, delta: `+${(mutationTo - mutationFrom).toFixed(2)}` }] : [],
    predictedFitnessScore: predictedFitness,
    // The score above is a heuristic formula over temperature and tool count;
    // no proving ground has evaluated this genome, so the honest status is
    // "unvalidated" until a real evaluation run is wired in.
    predictedFitnessBasis: 'heuristic',
    provingGroundStatus: 'UNVALIDATED_HEURISTIC'
  };
}

module.exports = {
  getPhylogeneticTree,
  analyzeAlleles,
  crossoverGenome
  ,validateCognitiveGenes
};
