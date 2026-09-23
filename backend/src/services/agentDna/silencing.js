function hasPioneer(gene, tfs) {
  return tfs && Array.isArray(tfs) && (tfs.includes('PIONEER_FACTOR') || tfs.includes(`PIONEER_${gene.locus}`));
}

function isCondensed(gene) {
  return gene.chromatin === 2 || gene.locked === true;
}

function regulatorsSilence(gene, tfs, mirnas) {
  const repressor = (gene.boundRepressor || gene.repressor) && tfs.includes(gene.boundRepressor || gene.repressor);
  const activator = (gene.requiredActivator || gene.activator) && !tfs.includes(gene.requiredActivator || gene.activator);
  const mirna = mirnas && mirnas.includes(gene.locus);
  return Boolean(repressor || activator || mirna);
}

function isSilenced(gene, context) {
  const baseSilenced = gene.methylated || gene.chromatin === 1 ||
    (Number.isFinite(gene.volume) && gene.volume <= 0);
  if (baseSilenced) return true;
  if (isCondensed(gene) && !hasPioneer(gene, context.activeTfs)) return true;
  return context.activeTfs ? regulatorsSilence(gene, context.activeTfs, context.activeMirnas) : false;
}

module.exports = { isSilenced, hasPioneer, isCondensed };
