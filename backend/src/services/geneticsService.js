/**
 * GenOS Genetics & Genome Service
 * Phylogenetic mutation tree, allele frequency analysis, and genetic crossover synthesizer.
 */

// Gene database catalog
const STANDARD_ALLELES = [
  { id: 'gene_guard_clause', name: 'Guard Clause Early Return', category: 'Strategy', frequency: 0.92, type: 'BENEFICIAL' },
  { id: 'gene_ast_validation', name: 'Sub-AST Strict Validation', category: 'Safety', frequency: 0.88, type: 'BENEFICIAL' },
  { id: 'gene_test_first', name: 'TDD Test Assertion Verification', category: 'Quality', frequency: 0.95, type: 'BENEFICIAL' },
  { id: 'gene_cot_reasoning', name: 'Chain-of-Thought Decomposition', category: 'Cognition', frequency: 0.89, type: 'BENEFICIAL' },
  { id: 'gene_unbounded_retry', name: 'Unbounded Recursion Loop', category: 'Fault', frequency: 0.04, type: 'LETHAL' },
  { id: 'gene_skip_linter', name: 'Bypass Static Analysis Guard', category: 'Security', frequency: 0.06, type: 'LETHAL' }
];

/**
 * Builds the phylogenetic mutation tree (evolutionary DAG)
 */
function getPhylogeneticTree(workspaceId = 'ws-genos-core') {
  const nodes = [
    {
      id: 'phylo-g0-root',
      parentId: null,
      generation: 0,
      name: 'Ancestral Architect (G0)',
      genes: { role: 'System Architect', strategy: 'MCTS Search', tools: ['genos_inspect', 'genos_create'], temp: 0.2 },
      fitnessScore: 82.5,
      status: 'ANCESTRAL',
      color: '#3fb950'
    },
    {
      id: 'phylo-g1-security',
      parentId: 'phylo-g0-root',
      generation: 1,
      name: 'Hardened Security Agent (G1)',
      mutationType: 'ToolAccessGene',
      genes: { role: 'Security Auditor', strategy: 'MCTS Search', tools: ['genos_inspect', 'genos_adversarial_review'], temp: 0.1 },
      fitnessScore: 91.0,
      status: 'BENEFICIAL',
      color: '#3fb950'
    },
    {
      id: 'phylo-g1-fast',
      parentId: 'phylo-g0-root',
      generation: 1,
      name: 'Fast Beam Agent (G1)',
      mutationType: 'StrategyGene',
      genes: { role: 'Fast Coder', strategy: 'Beam Search', tools: ['genos_create', 'genos_run'], temp: 0.4 },
      fitnessScore: 74.0,
      status: 'STABLE',
      color: '#58a6ff'
    },
    {
      id: 'phylo-g2-champion',
      parentId: 'phylo-g1-security',
      generation: 2,
      name: 'Champion Co-Evolutionary Agent (G2)',
      mutationType: 'RoleGene & HyperparameterGene',
      genes: { role: 'Lead Verifier', strategy: 'Reflexion Hybrid', tools: ['genos_inspect', 'genos_solve', 'genos_adversarial_review'], temp: 0.15 },
      fitnessScore: 97.5,
      status: 'CHAMPION',
      color: '#d29922'
    },
    {
      id: 'phylo-g2-divergent',
      parentId: 'phylo-g1-fast',
      generation: 2,
      name: 'Divergent Hallucinator (G2)',
      mutationType: 'HyperparameterGene',
      genes: { role: 'Fast Coder', strategy: 'Beam Search', tools: ['genos_run'], temp: 0.95 },
      fitnessScore: 35.0,
      status: 'EXTINCT',
      color: '#cf222e'
    }
  ];

  const edges = nodes
    .filter(n => n.parentId)
    .map((n, idx) => ({
      id: `phylo-edge-${idx + 1}`,
      source: n.parentId,
      target: n.id,
      mutationType: n.mutationType || 'PointMutation'
    }));

  return {
    workspaceId,
    timestamp: new Date().toISOString(),
    totalGenerations: 3,
    nodeCount: nodes.length,
    championNode: nodes.find(n => n.status === 'CHAMPION'),
    nodes,
    edges
  };
}

/**
 * Mines allele and gene frequencies from trajectories and decisions
 */
function analyzeAlleles(additionalAlleles = []) {
  const allAlleles = [...STANDARD_ALLELES, ...additionalAlleles];

  const beneficial = allAlleles.filter(a => a.type === 'BENEFICIAL' && a.frequency >= 0.85);
  const lethal = allAlleles.filter(a => a.type === 'LETHAL' || a.frequency < 0.10);

  return {
    timestamp: new Date().toISOString(),
    totalAllelesTracked: allAlleles.length,
    dominantBeneficialGenes: beneficial,
    lethalDetrimentalGenes: lethal,
    geneFrequencyMatrix: allAlleles.map(a => ({
      alleleId: a.id,
      name: a.name,
      category: a.category,
      successCorrelation: `${Math.round(a.frequency * 100)}%`,
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

  const pA = parentA || {
    name: 'Senior Architect',
    genes: { role: 'Lead Architect', strategy: 'MCTS Search', tools: ['genos_inspect', 'genos_create'], temp: 0.2, topP: 0.9 }
  };

  const pB = parentB || {
    name: 'Security Auditor',
    genes: { role: 'Security Auditor', strategy: 'Reflexion', tools: ['genos_adversarial_review', 'genos_diff'], temp: 0.1, topP: 0.8 }
  };

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
