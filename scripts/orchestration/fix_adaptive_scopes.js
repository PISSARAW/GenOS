#!/usr/bin/env node
'use strict';
/**
 * Corrige les scopes 'undefined' dans les handlers patchetés.
 * Pour chaque fichier, déduit le scope real à partir du nom du fichier.
 */

const fs = require('fs');
const path = require('path');

const HANDLERS_DIR = 'backend/src/services/mcpBioTools/handlers';

// Mapping fichier → { scope, key }
const SCOPE_MAP = new Map([
  ['agrobacteriumTdnaHijack.js', ['mcp_bio::agrobacterium', 'agrobacteriumRegistry']],
  ['aneuploidy.js', ['mcp_bio::aneuploidy', 'aneuploidyRegistry']],
  ['chromosomalDeletion.js', ['mcp_bio::chromosomal_deletion', 'chromosomalDeletionRegistry']],
  ['chromosomalDuplication.js', ['mcp_bio::chromosomal_duplication', 'chromosomalDuplicationRegistry']],
  ['chromosomalInversion.js', ['mcp_bio::chromosomal_inversion', 'chromosomalInversionRegistry']],
  ['chromosomalTranslocation.js', ['mcp_bio::chromosomal_translocation', 'chromosomalTranslocationRegistry']],
  ['chimericMerge.js', ['mcp_bio::chimeric_merge', 'chimericRegistry']],
  ['conjoinedTwinBind.js', ['mcp_bio::conjoined_twin', 'conjoinedTwinRegistry']],
  ['consciousnessTransfer.js', ['mcp_bio::consciousness_transfer', 'consciousnessRegistry']],
  ['cryptophasia.js', ['mcp_bio::cryptophasia', 'cryptophasiaRegistry']],
  ['dynamicTripletExpansion.js', ['mcp_bio::dynamic_triplet_expansion', 'dynamicTripletExpansionRegistry']],
  ['embryonicDiapause.js', ['mcp_bio::embryonic_diapause', 'diapauseRegistry']],
  ['epigeneticMethylation.js', ['mcp_bio::epigenetic_methylation', 'epigeneticMethylationRegistry']],
  ['fetusInFetu.js', ['mcp_bio::fetus_in_fetu', 'fetusInFetuRegistry']],
  ['frameshiftMutation.js', ['mcp_bio::frameshift_mutation', 'frameshiftMutationRegistry']],
  ['freemartinInhibition.js', ['mcp_bio::freemartin_inhibition', 'freemartinRegistry']],
  ['heteropaternalSuperfecundation.js', ['mcp_bio::heteropaternal_superfecundation', 'heteropaternalRegistry']],
  ['horizontalGeneTransfer.js', ['mcp_bio::horizontal_gene_transfer', 'horizontalGeneTransferRegistry']],
  ['hybridMultiples.js', ['mcp_bio::hybrid_multiples', 'hybridMultiplesRegistry']],
  ['marmosetGermlineChimerism.js', ['mcp_bio::marmoset_germline_chimerism', 'marmosetGermlineRegistry']],
  ['mirrorTwinFork.js', ['mcp_bio::mirror_twin_fork', 'mirrorTwinRegistry']],
  ['mitochondrialDnaMutation.js', ['mcp_bio::mitochondrial_dna_mutation', 'mitochondrialRegistry']],
  ['monozygoticSplit.js', ['mcp_bio::monozygotic_split', 'monozygoticRegistry']],
  ['novikovCausalRebase.js', ['mcp_bio::novikov_causal_rebase', 'novikovRegistry']],
  ['obligatePolyembryony.js', ['mcp_bio::obligate_polyembryony', 'obligatePolyembryonyRegistry']],
  ['parasiticGraft.js', ['mcp_bio::parasitic_graft', 'parasiticGraftRegistry']],
  ['pointMutation.js', ['mcp_bio::point_mutation', 'pointMutationRegistry']],
  ['polyovulationSpawn.js', ['mcp_bio::polyovulation_spawn', 'polyovulationRegistry']],
  ['polyploidy.js', ['mcp_bio::polyploidy', 'polyploidyRegistry']],
  ['sesquizygoticSplit.js', ['mcp_bio::sesquizygotic_split', 'sesquizygoticRegistry']],
  ['superfetationPipeline.js', ['mcp_bio::superfetation_pipeline', 'superfetationRegistry']],
  ['tardigradeDsupShield.js', ['mcp_bio::tardigrade_dsup_shield', 'dsupRegistry']],
  ['tissueChimerism.js', ['mcp_bio::tissue_chimerism', 'tissueChimerismRegistry']],
  ['transposonJump.js', ['mcp_bio::transposon_jump', 'transposonRegistry']],
  ['turritopsisTransdifferentiation.js', ['mcp_bio::turritopsis_transdifferentiation', 'turritopsisRegistry']],
  ['viralEndogenization.js', ['mcp_bio::viral_endogenization', 'viralEndogenizationRegistry']],
  ['yamanakaReprogramming.js', ['mcp_bio::yamanaka_reprogramming', 'yamanakaRegistry']],
]);

function fixFile(opts) {
  const { filePath, scope, key, mapName } = opts;
  let content = fs.readFileSync(filePath, 'utf8');

  // Remplacer 'undefined', 'undefined' par les vrais scope/key
  content = content.replace(
    /persister\.getMcpBiomimicryRegistry\('undefined', 'undefined'\)/g,
    `persister.getMcpBiomimicryRegistry('${scope}', '${key}')`
  );
  content = content.replace(
    /persister\.makePersistentMap\('undefined', 'undefined',/g,
    `persister.makePersistentMap('${scope}', '${key}',`
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✓ ${path.basename(filePath)} → scope=${scope}, key=${key}`);
}

for (const [file, [scope, key]] of SCOPE_MAP) {
  const filePath = path.join(HANDLERS_DIR, file);
  if (fs.existsSync(filePath)) {
    const mapName = file.replace(/\.js$/, '').replace(/[A-Z]/g, m => m).replace(/^([A-Z])/, m => m) // keep original case
      // extract map name from file
      ;
    // Le nom de la Map exportée est dans MAP_REGISTRY initial
    let mapNameFromRegistry = null;
    const registryEntries = [
      ['agrobacteriumTdnaHijack.js','agrobacteriumRegistry'],
      ['aneuploidy.js','aneuploidyRegistry'],
      ['chromosomalDeletion.js','chromosomalDeletionRegistry'],
      ['chromosomalDuplication.js','chromosomalDuplicationRegistry'],
      ['chromosomalInversion.js','chromosomalInversionRegistry'],
      ['chromosomalTranslocation.js','chromosomalTranslocationRegistry'],
      ['chimericMerge.js','chimericRegistry'],
      ['conjoinedTwinBind.js','conjoinedTwinRegistry'],
      ['consciousnessTransfer.js','consciousnessRegistry'],
      ['cryptophasia.js','cryptophasiaRegistry'],
      ['dynamicTripletExpansion.js','dynamicTripletExpansionRegistry'],
      ['embryonicDiapause.js','DIAPAUSE_REGISTRY'],
      ['epigeneticMethylation.js','epigeneticMethylationRegistry'],
      ['fetusInFetu.js','fetusInFetuRegistry'],
      ['frameshiftMutation.js','frameshiftMutationRegistry'],
      ['freemartinInhibition.js','freemartinRegistry'],
      ['heteropaternalSuperfecundation.js','heteropaternalRegistry'],
      ['horizontalGeneTransfer.js','horizontalGeneTransferRegistry'],
      ['hybridMultiples.js','hybridMultiplesRegistry'],
      ['marmosetGermlineChimerism.js','marmosetGermlineRegistry'],
      ['mirrorTwinFork.js','mirrorTwinRegistry'],
      ['mitochondrialDnaMutation.js','mitochondrialRegistry'],
      ['monozygoticSplit.js','monozygoticRegistry'],
      ['novikovCausalRebase.js','novikovRegistry'],
      ['obligatePolyembryony.js','obligatePolyembryonyRegistry'],
      ['parasiticGraft.js','parasiticGraftRegistry'],
      ['pointMutation.js','pointMutationRegistry'],
      ['polyovulationSpawn.js','polyovulationRegistry'],
      ['polyploidy.js','polyploidyRegistry'],
      ['sesquizygoticSplit.js','sesquizygoticRegistry'],
      ['superfetationPipeline.js','superfetationRegistry'],
      ['tardigradeDsupShield.js','dsupRegistry'],
      ['tissueChimerism.js','tissueChimerismRegistry'],
      ['transposonJump.js','transposonRegistry'],
      ['turritopsisTransdifferentiation.js','turritopsisRegistry'],
      ['viralEndogenization.js','viralEndogenizationRegistry'],
      ['yamanakaReprogramming.js','yamanakaRegistry'],
    ];
    const mapEntry = registryEntries.find(([f]) => f === file);
    if (mapEntry) {
      fixFile(filePath, scope, key, mapEntry[1]);
    } else {
      console.warn(`⚠ ${file} sans entrée registry — ignoré`);
    }
  }
}
console.log('\nCorrection des scopes terminée.');
