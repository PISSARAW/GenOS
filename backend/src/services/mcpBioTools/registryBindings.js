const REGISTRIES = [
  ['agrobacteriumTdnaHijack', 'agrobacterium', 'agrobacteriumRegistry'],
  ['aneuploidy', 'aneuploidy', 'aneuploidyRegistry'],
  ['chimericMerge', 'chimeric_merge', 'chimericRegistry'],
  ['chromosomalDeletion', 'chromosomal_deletion', 'chromosomalDeletionRegistry'],
  ['chromosomalDuplication', 'chromosomal_duplication', 'chromosomalDuplicationRegistry'],
  ['chromosomalInversion', 'chromosomal_inversion', 'chromosomalInversionRegistry'],
  ['chromosomalTranslocation', 'chromosomal_translocation', 'chromosomalTranslocationRegistry'],
  ['conjoinedTwinBind', 'conjoined_twin', 'conjoinedTwinRegistry'],
  ['consciousnessTransfer', 'consciousness_transfer', 'consciousnessRegistry'],
  ['cryptophasia', 'cryptophasia', 'cryptophasiaRegistry', 'dialectRegistry'],
  ['dynamicTripletExpansion', 'dynamic_triplet_expansion', 'dynamicTripletExpansionRegistry', 'dynamicExpansionRegistry'],
  ['embryonicDiapause', 'embryonic_diapause', 'diapauseRegistry', 'DIAPAUSE_REGISTRY'],
  ['epigeneticMethylation', 'epigenetic_methylation', 'epigeneticMethylationRegistry'],
  ['fetusInFetu', 'fetus_in_fetu', 'FETUS_REGISTRY'],
  ['frameshiftMutation', 'frameshift_mutation', 'frameshiftMutationRegistry', 'frameshiftRegistry'],
  ['freemartinInhibition', 'freemartin_inhibition', 'freemartinRegistry', 'FREEMARTIN_REGISTRY'],
  ['horizontalGeneTransfer', 'horizontal_gene_transfer', 'horizontalGeneTransferRegistry', 'horizontalTransferRegistry'],
  ['heteropaternalSuperfecundation', 'heteropaternal_superfecundation', 'heteropaternalRegistry', 'HETEROPATERNAL_REGISTRY'],
  ['hybridMultiples', 'hybrid_multiples', 'hybridMultiplesRegistry', 'hybridClusterRegistry'],
  ['marmosetGermlineChimerism', 'marmoset_germline_chimerism', 'marmosetGermlineRegistry', 'MARMOSET_REGISTRY'],
  ['mirrorTwinFork', 'mirror_twin_fork', 'mirrorTwinRegistry'],
  ['mitochondrialDnaMutation', 'mitochondrial_dna_mutation', 'mtdnaRegistry'],
  ['monozygoticSplit', 'monozygotic_split', 'monozygoticRegistry', 'monozygoticClusterRegistry'],
  ['novikovCausalRebase', 'novikov_causal_rebase', 'novikovRegistry', 'timelineRegistry'],
  ['obligatePolyembryony', 'obligate_polyembryony', 'obligatePolyembryonyRegistry', 'POLYEMBRYONY_REGISTRY'],
  ['parasiticGraft', 'parasitic_graft', 'parasiticGraftRegistry'],
  ['pointMutation', 'point_mutation', 'pointMutationRegistry'],
  ['polyovulationSpawn', 'polyovulation_spawn', 'dizygoticFleetRegistry'],
  ['polyploidy', 'polyploidy', 'polyploidyRegistry'],
  ['sesquizygoticSplit', 'sesquizygotic_split', 'SESQUIZYGOTIC_REGISTRY'],
  ['superfetationPipeline', 'superfetation_pipeline', 'SUPERFETATION_REGISTRY'],
  ['tardigradeDsupShield', 'tardigrade_dsup_shield', 'dsupRegistry'],
  ['tissueChimerism', 'tissue_chimerism', 'tissueChimerismRegistry', 'TISSUE_CHIMERISM_REGISTRY'],
  ['transposonJump', 'transposon_jump', 'transposonRegistry'],
  ['turritopsisTransdifferentiation', 'turritopsis_transdifferentiation', 'turritopsisRegistry'],
  ['viralEndogenization', 'viral_endogenization', 'viralEndogenizationRegistry'],
  ['yamanakaReprogramming', 'yamanaka_reprogramming', 'yamanakaRegistry'],
  ['affordancesScanner', 'affordances_scanner', 'affordancesLedger']
];

function registryBindings() {
  return REGISTRIES.map(([file, scope, key, liveKey]) => ({
    scope: `mcp_bio::${scope}`,
    key,
    liveKey: liveKey || key,
    mod: require(`./handlers/${file}`)
  }));
}

function registryBindingForTool(toolName) {
  const entry = REGISTRIES.find(([file]) => {
    const suffix = file.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    return toolName.endsWith(suffix);
  });
  if (!entry) return null;
  const [file, scope, key, liveKey] = entry;
  return { scope: `mcp_bio::${scope}`, key, liveKey: liveKey || key, mod: require(`./handlers/${file}`) };
}

module.exports = { registryBindings, registryBindingForTool };
