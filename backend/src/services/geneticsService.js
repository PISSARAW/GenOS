const { getDatabase } = require('../db');
const crypto = require('crypto');
const {
  contentFingerprint,
  validateCognitiveGenes,
  SEED_TREE_NODES,
  SEED_TREE_EDGES
} = require('./geneticsConstants');
const {
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
} = require('./geneticsServiceHelpers');

async function getPhylogeneticTree(workspaceId) {
  const db = await getDatabase();
  const rows = await db.all('SELECT * FROM lineage_nodes WHERE workspace_id = ? ORDER BY created_at ASC', workspaceId);
  const edgeRows = rows.length > 0
    ? await db.all('SELECT * FROM lineage_edges WHERE workspace_id = ?', workspaceId)
    : SEED_TREE_EDGES;
  const sourceRows = rows.length > 0 ? rows : SEED_TREE_NODES;
  const parentsByChild = buildParentIndex(edgeRows);
  const nodes = sourceRows.map((row) => {
    return buildTreeNode(row, parentsByChild);
  });
  const edges = edgeRows.map((row) => {
    return mapTreeEdge(row);
  });
  return {
    workspaceId,
    timestamp: new Date().toISOString(),
    totalGenerations: nodes.reduce((max, node) => {
      return Math.max(max, node.generation);
    }, 0),
    nodeCount: nodes.length,
    championNode: nodes.find((node) => {
      return node.status === 'CHAMPION';
    }),
    nodes,
    edges
  };
}

async function analyzeAlleles(scope = {}) {
  const db = await getDatabase();
  const { scoped, alleles } = await collectDecisionAlleles(db, scope);
  const lineage = await collectLineageRows(db, scoped, scope);
  const { scoredCount, correlation } = countScoredLineage(lineage);
  const geneFrequencyMatrix = buildGeneFrequencyMatrix(buildGeneStats(lineage));
  const beneficial = geneFrequencyMatrix.filter((gene) => {
    return gene.status === 'BENEFICIAL_CANDIDATE';
  });
  const lethal = geneFrequencyMatrix.filter((gene) => {
    return gene.status === 'DETRIMENTAL_CANDIDATE';
  });
  const recordedAlleles = alleles.map((allele) => {
    return {
      alleleId: allele.id,
      name: allele.name,
      category: allele.category,
      successCorrelation: correlation,
      status: allele.type
    };
  });
  return {
    timestamp: new Date().toISOString(),
    totalAllelesTracked: alleles.length,
    dominantBeneficialGenes: beneficial,
    lethalDetrimentalGenes: lethal,
    unclassifiedAlleles: alleles,
    analysisBasis: scoredCount > 0 ? 'lineage-and-recorded-decisions' : 'recorded-decisions-only',
    selectionAnalysisAvailable: scoredCount > 0,
    geneFrequencyMatrix: [...recordedAlleles, ...geneFrequencyMatrix]
  };
}

function crossoverGenome(parentA, parentB, options = {}) {
  const context = buildCrossoverContext(parentA, parentB, options);
  const childGenes = {};
  const geneKeys = ['role', 'strategy', 'tools', 'temp', 'topP'];
  const childId = `agent-crossover-${crypto.randomUUID()}`;
  for (let index = 0; index < geneKeys.length; index++) {
    const key = geneKeys[index];
    const pickA = pickLocus(key, index, context);
    if (key === 'tools') {
      childGenes.tools = recombineTools(pickA, context);
    } else {
      childGenes[key] = pickA ? parentA.genes[key] : parentB.genes[key];
    }
  }
  const mutations = applyCrossoverMutations(childGenes, context);
  const predictedFitness = Number(Math.min(99.0, 88.0 + (1 - childGenes.temp) * 8 + (childGenes.tools.length >= 3 ? 3 : 0)).toFixed(1));
  return {
    childId,
    reproducibilitySeed: context.reproducibilitySeed,
    parentFingerprint: context.parentFingerprint,
    genomeHash: contentFingerprint(childGenes),
    crossoverStrategy: context.strategy,
    mutationRateApplied: context.mutationRate,
    parents: {
      parentA: parentA.name || 'Parent A',
      parentB: parentB.name || 'Parent B'
    },
    childGenes,
    mutations,
    predictedFitnessScore: predictedFitness,
    predictedFitnessBasis: 'heuristic',
    provingGroundStatus: 'UNVALIDATED_HEURISTIC'
  };
}

function somaticHypermutate(genes = {}, options = {}) {
  validateCognitiveGenes(genes, 'somaticHypermutate');
  const context = resolveHyperparameters(genes, options);
  const mutatedGenes = {
    ...genes,
    tools: [...(genes.tools || [])]
  };
  const mutationsApplied = [];
  const tempMutation = reheatTemperature(mutatedGenes, context);
  if (tempMutation) {
    mutationsApplied.push(tempMutation);
  }
  const topPMutation = perturbTopP(mutatedGenes, context);
  if (topPMutation) {
    mutationsApplied.push(topPMutation);
  }
  const toolMutation = diversifyTools(mutatedGenes, context);
  if (toolMutation) {
    mutationsApplied.push(toolMutation);
  }
  const strategyMutation = mutateStrategy(mutatedGenes, context);
  if (strategyMutation) {
    mutationsApplied.push(strategyMutation);
  }
  const hypermutationScore = Number((mutationsApplied.length * 0.25 * context.stressLevel).toFixed(2));
  return {
    reproducibilitySeed: context.seed,
    originalGenes: genes,
    mutatedGenes,
    mutationsApplied,
    stressLevel: context.stressLevel,
    effectiveRate: context.effectiveRate,
    hypermutationScore,
    isHypermutated: mutationsApplied.length > 0
  };
}

const nucleotideTranslation = require('./nucleotideTranslationService');

module.exports = {
  getPhylogeneticTree,
  analyzeAlleles,
  crossoverGenome,
  somaticHypermutate,
  validateCognitiveGenes,
  ...nucleotideTranslation
};
