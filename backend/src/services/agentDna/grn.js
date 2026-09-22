const { isSilenced } = require('./silencing');

function computeActiveTfs(grn, genes) {
  if (!grn || typeof grn !== 'object') return [];
  const nodes = grn.nodes;
  if (!nodes || typeof nodes !== 'object') return [];
  return Object.entries(nodes).filter(([locus, node]) => {
    const gene = genes[locus];
    return gene && !gene.methylated && gene.chromatin !== 1 && node.isTf && node.basalExpression > 0;
  }).map(([locus]) => locus);
}

function computeActiveMirnas(genes, context) {
  return Object.entries(genes).filter(([locus, gene]) => locus.startsWith('MIR_') && !isSilenced(gene, context)).map(([locus]) => locus);
}

module.exports = { computeActiveTfs, computeActiveMirnas };
