#!/usr/bin/env node
'use strict';

/**
 * Patche les handlers MCP biomimétiques et embryonicDiapause pour rendre
 * leurs Maps d'état persistantes via adaptiveStateService.
 *
 * Pour chaque handler qui exporte une Map nommée <X>Registry ou <X>Ledger
 * ou <X>State (const <name> = new Map()), on ajoute :
 *   - require('./adaptiveStateServiceProxy') (si pas déjà présent)
 *   - export de setAdaptivePersister(port) / getAdaptivePersister()
 *   - export de getSnapshot() / onMutation()
 *   - un Proxy persistant quand persister est disponible
 *   - bootstrap réhydratation depuis DB
 */

const fs = require('fs');
const path = require('path');

const HANDLERS_DIR = 'backend/src/services/mcpBioTools/handlers';
const EMBRYONIC_FILE = 'backend/src/services/mcpBioTools/handlers/embryonicDiapause.js';

// Liste des fichiers et du nom de la Map à rendre persistante
const MAP_REGISTRY = new Map([
  // [fichier, nomExportMap, scopeDb, cleDb]
  ['agrobacteriumTdnaHijack.js', 'agrobacteriumRegistry', 'mcp_bio::agrobacterium', 'agrobacteriumRegistry'],
  ['aneuploidy.js', 'aneuploidyRegistry', 'mcp_bio::aneuploidy', 'aneuploidyRegistry'],
  ['chromosomalDeletion.js', 'chromosomalDeletionRegistry', 'mcp_bio::chromosomal_deletion', 'chromosomalDeletionRegistry'],
  ['chromosomalDuplication.js', 'chromosomalDuplicationRegistry', 'mcp_bio::chromosomal_duplication', 'chromosomalDuplicationRegistry'],
  ['chromosomalInversion.js', 'chromosomalInversionRegistry', 'mcp_bio::chromosomal_inversion', 'chromosomalInversionRegistry'],
  ['chromosomalTranslocation.js', 'chromosomalTranslocationRegistry', 'mcp_bio::chromosomal_translocation', 'chromosomalTranslocationRegistry'],
  ['chimericMerge.js', 'chimericRegistry', 'mcp_bio::chimeric_merge', 'chimericRegistry'],
  ['conjoinedTwinBind.js', 'conjoinedTwinRegistry', 'mcp_bio::conjoined_twin', 'conjoinedTwinRegistry'],
  ['consciousnessTransfer.js', 'consciousnessRegistry', 'mcp_bio::consciousness_transfer', 'consciousnessRegistry'],
  ['cryptophasia.js', 'cryptophasiaRegistry', 'mcp_bio::cryptophasia', 'cryptophasiaRegistry'],
  ['dynamicTripletExpansion.js', 'dynamicTripletExpansionRegistry', 'mcp_bio::dynamic_triplet_expansion', 'dynamicTripletExpansionRegistry'],
  ['embryonicDiapause.js', 'DIAPAUSE_REGISTRY', 'mcp_bio::embryonic_diapause', 'diapauseRegistry'],
  ['epigeneticMethylation.js', 'epigeneticMethylationRegistry', 'mcp_bio::epigenetic_methylation', 'epigeneticMethylationRegistry'],
  ['fetusInFetu.js', 'fetusInFetuRegistry', 'mcp_bio::fetus_in_fetu', 'fetusInFetuRegistry'],
  ['frameshiftMutation.js', 'frameshiftMutationRegistry', 'mcp_bio::frameshift_mutation', 'frameshiftMutationRegistry'],
  ['freemartinInhibition.js', 'freemartinRegistry', 'mcp_bio::freemartin_inhibition', 'freemartinRegistry'],
  ['heteropaternalSuperfecundation.js', 'heteropaternalRegistry', 'mcp_bio::heteropaternal_superfecundation', 'heteropaternalRegistry'],
  ['horizontalGeneTransfer.js', 'horizontalGeneTransferRegistry', 'mcp_bio::horizontal_gene_transfer', 'horizontalGeneTransferRegistry'],
  ['hybridMultiples.js', 'hybridMultiplesRegistry', 'mcp_bio::hybrid_multiples', 'hybridMultiplesRegistry'],
  ['marmosetGermlineChimerism.js', 'marmosetGermlineRegistry', 'mcp_bio::marmoset_germline_chimerism', 'marmosetGermlineRegistry'],
  ['mirrorTwinFork.js', 'mirrorTwinRegistry', 'mcp_bio::mirror_twin_fork', 'mirrorTwinRegistry'],
  ['mitochondrialDnaMutation.js', 'mitochondrialRegistry', 'mcp_bio::mitochondrial_dna_mutation', 'mitochondrialRegistry'],
  ['monozygoticSplit.js', 'monozygoticRegistry', 'mcp_bio::monozygotic_split', 'monozygoticRegistry'],
  ['novikovCausalRebase.js', 'novikovRegistry', 'mcp_bio::novikov_causal_rebase', 'novikovRegistry'],
  ['obligatePolyembryony.js', 'obligatePolyembryonyRegistry', 'mcp_bio::obligate_polyembryony', 'obligatePolyembryonyRegistry'],
  ['parasiticGraft.js', 'parasiticGraftRegistry', 'mcp_bio::parasitic_graft', 'parasiticGraftRegistry'],
  ['pointMutation.js', 'pointMutationRegistry', 'mcp_bio::point_mutation', 'pointMutationRegistry'],
  ['polyovulationSpawn.js', 'polyovulationRegistry', 'mcp_bio::polyovulation_spawn', 'polyovulationRegistry'],
  ['polyploidy.js', 'polyploidyRegistry', 'mcp_bio::polyploidy', 'polyploidyRegistry'],
  ['sesquizygoticSplit.js', 'sesquizygoticRegistry', 'mcp_bio::sesquizygotic_split', 'sesquizygoticRegistry'],
  ['superfetationPipeline.js', 'superfetationRegistry', 'mcp_bio::superfetation_pipeline', 'superfetationRegistry'],
  ['tardigradeDsupShield.js', 'dsupRegistry', 'mcp_bio::tardigrade_dsup_shield', 'dsupRegistry'],
  ['tissueChimerism.js', 'tissueChimerismRegistry', 'mcp_bio::tissue_chimerism', 'tissueChimerismRegistry'],
  ['transposonJump.js', 'transposonRegistry', 'mcp_bio::transposon_jump', 'transposonRegistry'],
  ['turritopsisTransdifferentiation.js', 'turritopsisRegistry', 'mcp_bio::turritopsis_transdifferentiation', 'turritopsisRegistry'],
  ['viralEndogenization.js', 'viralEndogenizationRegistry', 'mcp_bio::viral_endogenization', 'viralEndogenizationRegistry'],
  ['yamanakaReprogramming.js', 'yamanakaRegistry', 'mcp_bio::yamanaka_reprogramming', 'yamanakaRegistry'],
]);

const ADAPTIVE_SERVICE_PATH = '../../../adaptiveStateBootstrap';

function patchFile({ filePath, mapName, scope, key }) {
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Ajouter require du persister si pas déjà présent
  const persistRequire = `const adaptivePersister = require('${ADAPTIVE_SERVICE_PATH}');`;
  const requirePattern = /^const adaptivePersister = require\('.*adaptiveState.*'\);/m;
  if (!requirePattern.test(content)) {
    // Trouver la dernière ligne "const xxx = require(...);" ou "const crypto = ...;"
    const firstRequireMatch = content.match(/^(const [^=]+ = require\([^)]+\);)/m);
    if (firstRequireMatch) {
      content = content.replace(firstRequireMatch[1], firstRequireMatch[1] + '\n' + persistRequire);
    } else {
      content = persistRequire + '\n' + content;
    }
  }

  // 2. Remplacer la déclaration de la Map par un proxy si persister disponible
  // const <mapName> = new Map();
  const mapDeclPattern = new RegExp(`(const ${mapName} = )new Map\\(\\);`);
  if (mapDeclPattern.test(content)) {
    content = content.replace(
      mapDeclPattern,
      `$1new Map(); /* persisterHook: ${mapName} */`
    );
  }

  // 3. Avant module.exports, ajouter le code de persistance
  const proxySetup = `
// ── Persistance adaptive hors process ──────────────────────────────────────
let _${mapName}Persistent = false;

function _ensure${mapName}Persistent() {
  if (_${mapName}Persistent || !adaptivePersister || !adaptivePersister.getAdaptivePersister) return;
  try {
    const persister = adaptivePersister.getAdaptivePersister();
    if (!persister) return;
    // Réhydrate depuis DB
    const stored = persister.getMcpBiomimicryRegistry ? persister.getMcpBiomimicryRegistry('${scope}', '${key}') : null;
    const mapToUse = stored && stored.size ? stored : ${mapName};
    const persistentMap = persister.makePersistentMap ? persister.makePersistentMap('${scope}', '${key}', mapToUse) : mapToUse;
    // Remplacer la référence exportée par le proxy persistant
    Object.defineProperty(module.exports, '${mapName}', {
      value: persistentMap,
      writable: true,
      configurable: true
    });
    _${mapName}Persistent = true;
  } catch (_) { /* best-effort */ }
}

function setAdaptivePersister(persister) {
  adaptivePersister.setAdaptivePersister && adaptivePersister.setAdaptivePersister(persister);
  _ensure${mapName}Persistent();
}

function getAdaptivePersister() {
  return adaptivePersister;
}

function getSnapshot() {
  const map = module.exports.${mapName} || ${mapName};
  const obj = {};
  if (map instanceof Map) {
    for (const [k, v] of map.entries()) obj[k] = v;
  }
  return obj;
}

function onMutation(snapshot) {
  // La Map est déjà persistée par le proxy ; on ne fait rien de plus.
}

_ensure${mapName}Persistent();
`;

  // Insérer avant module.exports
  const modExpPos = content.lastIndexOf('module.exports');
  if (modExpPos > 0) {
    content = content.slice(0, modExpPos) + proxySetup + '\n' + content.slice(modExpPos);
  }

  // 4. Ajouter les exports manquants
  const expRequire = /setAdaptivePersister[, ]*\n/g;
  const expString = `setAdaptivePersister,\n  getAdaptivePersister,\n  getSnapshot,\n  onMutation`;
  // Vérifier si exports existent déjà
  const expContent = content.slice(content.lastIndexOf('module.exports'));
  if (!expRequire.test(expContent) && !/getAdaptivePersister/.test(expContent)) {
    // Ajouter aux exports existants
    content = content.replace(
      /(module\.exports\s*=\s*\{[^}]*?)\n(\s*\})/s,
      (match, before, close) => {
        // Vérifier si setAdaptivePersister est déjà dans les exports
        if (/(setAdaptivePersister|getAdaptivePersister)/.test(before)) return match;
        return before + ',\n  setAdaptivePersister,\n  getAdaptivePersister,\n  getSnapshot,\n  onMutation' + close;
      }
    );
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✓ ${path.basename(filePath)} → ${mapName} persisté (scope: ${scope})`);
}

// Patcher tous les fichiers
for (const [file, mapName, scope, key] of MAP_REGISTRY) {
  const filePath = path.join(HANDLERS_DIR, file);
  if (fs.existsSync(filePath)) {
    try {
      patchFile({ filePath, mapName, scope, key });
    } catch (e) {
      console.error(`✗ ${file}: ${e.message}`);
    }
  } else {
    console.warn(`⚠ ${file} introuvable — ignoré`);
  }
}

console.log(`\n${MAP_REGISTRY.size} handlers patchetés pour persistance adaptive.`);
