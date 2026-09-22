function hasPioneer(gene, tfs) {
  return tfs && Array.isArray(tfs) && (tfs.includes('PIONEER_FACTOR') || tfs.includes(`PIONEER_${gene.locus}`));
}

function regulatorsSilence(gene, tfs, mirnas) {
  const repressor = gene.repressor && tfs.includes(gene.repressor);
  const activator = gene.requiredActivator && !tfs.includes(gene.requiredActivator);
  const mirna = mirnas && mirnas.includes(gene.locus);
  return Boolean(repressor || activator || mirna);
}

function isSilenced(gene, context) {
  const baseSilenced = gene.methylated || gene.chromatin === 1 ||
    (Number.isFinite(gene.volume) && gene.volume <= 0);
  if (baseSilenced) return true;
  if (gene.chromatin === 2 && !hasPioneer(gene, context.activeTfs)) return true;
  return context.activeTfs ? regulatorsSilence(gene, context.activeTfs, context.activeMirnas) : false;
}

module.exports = { isSilenced, hasPioneer };
