const { isSilenced } = require('./silencing');

const GRN_ITERATIONS = 8;

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function basalLevels(grn, genes, development) {
  const levels = {};
  for (const [locus, gene] of Object.entries(genes || {})) {
    const node = grn && grn.nodes ? grn.nodes[locus] : null;
    const basal = node && Number.isFinite(node.basalExpression)
      ? Math.min(1, Math.max(0, node.basalExpression))
      : Math.min(1, Math.max(0, Number(gene.volume) || 0));
    levels[locus] = basal + lineageBias(development, locus);
  }
  return levels;
}

function lineageBias(development, locus) {
  const lineage = development && development.lineageCommitment;
  if (lineage && String(lineage).trim()) {
    return String(locus).includes(String(lineage)) ? 0 : -0.2;
  }
  return 0;
}

function edgeInput(grn, levels, target) {
  if (!grn || !Array.isArray(grn.edges)) return 0;
  return grn.edges
    .filter((edge) => edge && edge.to === target)
    .reduce((sum, edge) => sum + (levels[edge.from] || 0) * (Number(edge.weight) || 0), 0);
}

function morphogenSignal(development, locus) {
  const morphogens = (development && development.morphogens) || [];
  return morphogens.includes(locus) ? 0.5 : 0;
}

function stageSignal(development) {
  const stage = development && development.stage;
  if (stage === 'Mature') return 0.1;
  if (stage === 'Senescent') return -0.3;
  if (stage === 'Zygote') return -0.2;
  return 0;
}

function differentiationSignal(development, locus) {
  if (development && development.differentiationSignal === locus) return 0.3;
  return 0;
}

function nodeSignal(development, locus) {
  return morphogenSignal(development, locus) + stageSignal(development) + differentiationSignal(development, locus);
}

function iterateLevels(grn, basals, levels, development) {
  const next = {};
  for (const locus of Object.keys(basals)) {
    const basal = basals[locus] || 0;
    next[locus] = sigmoid(basal + edgeInput(grn, levels, locus) + nodeSignal(development, locus));
  }
  return next;
}

function isTfLocus(locus) {
  return locus.startsWith('TF_') || locus.startsWith('PIONEER_');
}

function isActiveTf(locus, level, grn, genes) {
  if (!(level > 0.5)) return false;
  const gene = genes[locus];
  if (!gene || gene.methylated || gene.chromatin === 1) return false;
  const node = grn && grn.nodes ? grn.nodes[locus] : null;
  if (node && typeof node.isTf === 'boolean') return node.isTf;
  return isTfLocus(locus);
}

function propagateGrn(grn, genes, development) {
  const basals = basalLevels(grn, genes, development);
  let levels = { ...basals };
  for (let i = 0; i < GRN_ITERATIONS; i += 1) {
    levels = iterateLevels(grn, basals, levels, development);
  }
  return levels;
}

function computeActiveTfs(grn, genes, development) {
  const levels = propagateGrn(grn, genes, development);
  return Object.entries(levels)
    .filter(([locus, level]) => isActiveTf(locus, level, grn, genes))
    .map(([locus]) => locus)
    .sort();
}

function computeActiveMirnas(genes, context) {
  return Object.entries(genes).filter(([locus, gene]) => locus.startsWith('MIR_') && !isSilenced(gene, context)).map(([locus]) => locus).sort();
}

module.exports = { computeActiveTfs, computeActiveMirnas, propagateGrn, sigmoid };
