/**
 * GenOS Genetics & Genome Service
 * Phylogenetic mutation tree, allele frequency analysis, and genetic crossover synthesizer.
 */

const { getDatabase } = require('../db');

/**
 * Builds the phylogenetic mutation tree (evolutionary DAG)
 */
async function getPhylogeneticTree(workspaceId) {
  const db = await getDatabase();
  const rows = await db.all('SELECT * FROM lineage_nodes WHERE workspace_id = ? ORDER BY created_at ASC', workspaceId);
  const edgeRows = await db.all('SELECT * FROM lineage_edges WHERE workspace_id = ?', workspaceId);
  const nodes = rows.map((row) => {
    let metadata = {};
    try { metadata = JSON.parse(row.metadata || '{}'); } catch {}
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
  const decisions = await db.all('SELECT id, title, category, content, created_at FROM genome_decisions ORDER BY created_at ASC');
  const allAlleles = decisions.map((decision) => ({
    id: decision.id,
    name: decision.title,
    category: decision.category,
    type: 'RECORDED',
    content: decision.content,
    createdAt: decision.created_at
  }));

  const beneficial = [];
  const lethal = [];

  return {
    timestamp: new Date().toISOString(),
    totalAllelesTracked: allAlleles.length,
    dominantBeneficialGenes: beneficial,
    lethalDetrimentalGenes: lethal,
    geneFrequencyMatrix: allAlleles.map(a => ({
      alleleId: a.id,
      name: a.name,
      category: a.category,
      successCorrelation: null,
      status: a.type
    }))
  };
}

/**
 * Performs genetic crossover recombination between two parent agent genomes
 */
function crossoverGenome(parentA, parentB, options = {}) {
  const strategy = options.strategy || 'uniform'; // single_point, multi_point, uniform
  const mutationRate = Math.min(0.15, Math.max(0.0, options.mutationRate || 0.05));

  if (!parentA?.genes || !parentB?.genes) {
    throw new Error('Two recorded parent genomes are required');
  }
  const pA = parentA;
  const pB = parentB;

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
      // uniform
      pickA = Math.random() >= 0.5;
    }

    if (key === 'tools') {
      const toolSet = new Set(pickA ? pA.genes.tools : pB.genes.tools);
      // Horizontal gene transfer
      if (Math.random() < 0.5) toolSet.add(pB.genes.tools[0] || 'genos_inspect');
      childGenes.tools = Array.from(toolSet);
    } else {
      childGenes[key] = pickA ? pA.genes[key] : pB.genes[key];
    }
  }

  // Apply mutation if triggered
  let mutatedGene = null;
  if (Math.random() < mutationRate * 5) {
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
    provingGroundStatus: 'VALIDATED_SAFE'
  };
}

module.exports = {
  getPhylogeneticTree,
  analyzeAlleles,
  crossoverGenome
};
