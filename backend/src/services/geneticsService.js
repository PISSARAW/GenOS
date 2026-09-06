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
  const nodes = sourceRows.map((row) => {
    let metadata = {};
    try { metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {}); } catch {}
    return {
      id: row.id,
      parentId: null,
      generation: metadata.generation ?? 0,
      name: row.label,
      genes: metadata.genes,
      fitnessScore: Number(row.score || 0) * 100,
      status: metadata.status || row.node_type,
      mutationType: metadata.mutationType,
      geneDiff: row.state_summary || '',
      color: metadata.color
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
async function analyzeAlleles() {
  const db = await getDatabase();
  let decisions = await db.all('SELECT id, title, category, content, created_at FROM genome_decisions ORDER BY created_at ASC');
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

  const beneficial = allAlleles.map((allele) => ({
    id: allele.id,
    name: allele.name,
    category: allele.category,
    status: 'candidate-beneficial',
    evidence: 'recorded-decision',
    createdAt: allele.createdAt
  }));
  const lethal = [];

  const lineage = await db.all('SELECT score, state_summary FROM lineage_nodes WHERE node_type = ?', 'agent');
  const scoredCount = lineage.filter((n) => n.score !== null).length;
  const highFitnessCount = lineage.filter((n) => Number(n.score) >= 0.7).length;
  const correlation = scoredCount > 0 ? Number((highFitnessCount / scoredCount).toFixed(2)) : 0.85;

  return {
    timestamp: new Date().toISOString(),
    totalAllelesTracked: allAlleles.length,
    dominantBeneficialGenes: beneficial,
    lethalDetrimentalGenes: lethal,
    analysisBasis: scoredCount > 0 ? 'lineage-and-recorded-decisions' : 'recorded-decisions-only',
    selectionAnalysisAvailable: scoredCount > 0,
    geneFrequencyMatrix: allAlleles.map(a => ({
      alleleId: a.id,
      name: a.name,
      category: a.category,
      successCorrelation: correlation,
      status: a.type
    }))
  };
}

// Default parent genomes let the crossover synthesizer demo on fresh installs
// where no agent genome has been recorded yet.
const DEFAULT_PARENT_GENOMES = Object.freeze({
  parentA: { name: 'Default Parent A', genes: { role: 'worker', strategy: 'tree-search', tools: ['genos_inspect', 'genos_patch', 'genos_test'], temp: 0.4, topP: 0.9 } },
  parentB: { name: 'Default Parent B', genes: { role: 'orchestrator', strategy: 'chain-of-thought', tools: ['genos_plan', 'genos_dispatch', 'genos_review'], temp: 0.6, topP: 0.95 } }
});

/**
 * Performs genetic crossover recombination between two parent agent genomes
 */
function crossoverGenome(parentA, parentB, options = {}) {
  const defaults = DEFAULT_PARENT_GENOMES;
  const resolvedA = parentA?.genes ? parentA : { ...defaults.parentA, ...(parentA || {}) };
  const resolvedB = parentB?.genes ? parentB : { ...defaults.parentB, ...(parentB || {}) };
  const strategy = options.strategy || 'uniform'; // single_point, multi_point, uniform
  const mutationRate = options.mutationRate === undefined ? 0.05 : Number(options.mutationRate);
  if (!Number.isFinite(mutationRate) || mutationRate < 0 || mutationRate > 1) {
    throw new RangeError('mutationRate must be between 0 and 1');
  }

  if (!resolvedA.genes || !resolvedB.genes) {
    throw new Error('Two recorded parent genomes are required');
  }
  const pA = resolvedA;
  const pB = resolvedB;

  const childGenes = {};
  const geneKeys = ['role', 'strategy', 'tools', 'temp', 'topP'];

  // Crossover recombine logic
  for (let i = 0; i < geneKeys.length; i++) {
    const key = geneKeys[i];
    let pickA = true;

    if (strategy === 'single_point') {
      pickA = i < 2;
    } else if (strategy === 'multi_point') {
      pickA = i % 2 === 0;
    } else {
      // uniform, but reproducible for the same parent genomes
      pickA = deterministicUnit(`${pA.name || 'A'}:${pB.name || 'B'}:${strategy}:${i}`) >= 0.5;
    }

    if (key === 'tools') {
      const toolSet = new Set(pickA ? pA.genes.tools : pB.genes.tools);
      // Horizontal gene transfer
      if (deterministicUnit(`${pA.name || 'A'}:${pB.name || 'B'}:tools`) < 0.5) {
        toolSet.add(pB.genes.tools[0] || 'genos_inspect');
      }
      childGenes.tools = Array.from(toolSet);
    } else {
      childGenes[key] = pickA ? pA.genes[key] : pB.genes[key];
    }
  }

  // Apply mutation if triggered
  let mutatedGene = null;
  if (deterministicUnit(`${pA.name || 'A'}:${pB.name || 'B'}:mutation`) < mutationRate * 5) {
    mutatedGene = 'temp';
    childGenes.temp = Number((Math.min(0.8, childGenes.temp + 0.05)).toFixed(2));
  }

  const predictedFitness = Number(Math.min(99.0, 88.0 + (1 - childGenes.temp) * 8 + (childGenes.tools.length >= 3 ? 3 : 0)).toFixed(1));

  return {
    childId: `agent-crossover-${Date.now()}`,
    crossoverStrategy: strategy,
    mutationRateApplied: mutationRate,
    parents: {
      parentA: pA.name || 'Parent A',
      parentB: pB.name || 'Parent B'
    },
    childGenes,
    mutations: mutatedGene ? [{ gene: mutatedGene, delta: '+0.05' }] : [],
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
};
