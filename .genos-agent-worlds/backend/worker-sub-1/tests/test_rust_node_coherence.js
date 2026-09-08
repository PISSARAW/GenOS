/**
 * test_rust_node_coherence.js
 * 
 * End-to-End Integration Suite verifying the architectural, algorithmic,
 * and data-contract coherence between Rust crates/ and Node.js backend/.
 */

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { runGenosSync, studioBridgeRoot } = require('../src/services/genosCli');
const { validateWithSchema } = require('../src/services/specValidator');
const { calculateRallAttenuation, evaluateNmdaSpike, normalizeCompartment, normalizeSpineMorphology } = require('../src/services/neurobiologyBiophysics');
const { evaluateApoptosis } = require('../src/services/resilienceService');
const { getDatabase } = require('../src/db');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const GENOME_SCHEMA = path.join(ROOT_DIR, 'spec', 'genome.schema.json');

async function runCoherenceSuite() {
  console.log('================================================================');
  console.log('       TEST SUITE : COHÉRENCE ARCHITECTURALE RUST <-> NODE      ');
  console.log('================================================================\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-coherence-'));
  const testAgent = `agent_coherence_${Date.now()}`;

  try {
    // ------------------------------------------------------------------------
    // 1. Schéma Agent & Manifeste
    // ------------------------------------------------------------------------
    console.log('[1/7] Schéma Agent : validation croisée Rust CLI <-> genome.schema.json');
    const genomeFile = path.join(tmpDir, `${testAgent}.json`).replace(/\\/g, '/');
    const createOut = runGenosSync(`genos agent create --name ${testAgent} --role strategist --out ${genomeFile}`);
    assert.ok(fs.existsSync(genomeFile), `Fichier génome créé (${genomeFile})`);

    const schemaContent = JSON.parse(fs.readFileSync(GENOME_SCHEMA, 'utf-8'));
    const generatedGenome = JSON.parse(fs.readFileSync(genomeFile, 'utf-8'));
    const validationResult = validateWithSchema(generatedGenome, schemaContent);
    assert.equal(validationResult.valid, true, `Le génome Rust doit être 100% conforme au schéma Node: ${JSON.stringify(validationResult.errors)}`);
    console.log('  -> PASS: Génome créé par le CLI validé par specValidator.\n');

    // ------------------------------------------------------------------------
    // 2. Racine CWD unifiée
    // ------------------------------------------------------------------------
    console.log('[2/7] Résolution de racine : pas de sous-dossier parasite imbriqué');
    const bridgeRoot = studioBridgeRoot();
    const accidentalNested = path.join(bridgeRoot, '.genos');
    assert.equal(fs.existsSync(accidentalNested), false, 'Aucun répertoire parasite .genos-matrix/.genos ne doit être créé');
    console.log('  -> PASS: Résolution de racine non-imbriquée vérifiée.\n');

    // ------------------------------------------------------------------------
    // 3. Division Cellulaire & Préservation Génétique
    // ------------------------------------------------------------------------
    console.log('[3/7] Division Cellulaire : préservation et persistance des gènes');
    const divisionOut = runGenosSync(
      `genos evolution division --agent-id ${testAgent} --mode budding --daughter-volume 0.3 --genes "{\\"core_logic\\":\\"mcts\\",\\"safety_gate\\":\\"strict\\"}"`
    );
    const parsedDiv = JSON.parse(divisionOut.toString());
    assert.equal(parsedDiv.success, true);
    assert.ok(parsedDiv.mother_genes_count >= 2, 'Les gènes injectés doivent être présents dans la mère');
    assert.ok(parsedDiv.daughter_genes_count >= 2, 'Les gènes doivent être transmis à la fille');
    console.log('  -> PASS: Transmission génétique parent/fille validée.\n');

    // ------------------------------------------------------------------------
    // 4. Neurobiologie & Biophysique Rall / NMDA
    // ------------------------------------------------------------------------
    console.log('[4/7] Neurobiologie : atténuation de Rall et spike NMDA');
    const vAttenuated = calculateRallAttenuation(20.0, 0.5, 1.0);
    const expectedV = 20.0 * Math.exp(-0.5);
    assert.ok(Math.abs(vAttenuated - expectedV) < 0.01, 'Atténuation de câble de Rall');

    const sub = evaluateNmdaSpike(0.8, 1.0, 1.2);
    assert.equal(sub.isNmdaSpike, false);

    const supra = evaluateNmdaSpike(1.5, 2.0, 1.2);
    assert.equal(supra.isNmdaSpike, true);
    assert.ok(supra.voltage > 1.5);

    assert.equal(normalizeCompartment('apical'), 'ApicalDendrite');
    assert.equal(normalizeSpineMorphology('mushroom'), 'Mushroom');
    console.log('  -> PASS: Cohérence biophysique Rall et NMDA validée.\n');

    // ------------------------------------------------------------------------
    // 5. Épigénétique & Facteurs Pionniers
    // ------------------------------------------------------------------------
    console.log('[5/7] Épigénétique : intégrité des verrous constitutifs');
    // Verrouillage constitutif
    runGenosSync(`genos biomimicry epigenetic-chromatin --agent-id ${testAgent} --locus critical_defense --state heterochromatin_constitutive`);

    // Tentative sans facteur pionnier -> doit échouer
    let failedWithoutPioneer = false;
    try {
      runGenosSync(`genos biomimicry epigenetic-chromatin --agent-id ${testAgent} --locus critical_defense --state euchromatin`);
    } catch (err) {
      failedWithoutPioneer = true;
    }
    assert.equal(failedWithoutPioneer, true, 'Le déverrouillage constitutif sans facteur pionnier doit échouer');

    // Tentative avec facteur pionnier -> doit réussir
    const unlockOut = runGenosSync(`genos biomimicry epigenetic-chromatin --agent-id ${testAgent} --locus critical_defense --state euchromatin --pioneer-factor`);
    const parsedUnlock = JSON.parse(unlockOut.toString());
    assert.equal(parsedUnlock.success, true);
    console.log('  -> PASS: Protection épigénétique et facteurs pionniers validés.\n');

    // ------------------------------------------------------------------------
    // 6. Plasmides & HGT
    // ------------------------------------------------------------------------
    console.log('[6/7] Plasmides & HGT : persistance dans la chromatine Rust');
    const plasmidOut = runGenosSync(`genos evolution assimilate-plasmid --agent-id ${testAgent} --plasmid-name plasmid_autonomous_patch`);
    const parsedPlasmid = JSON.parse(plasmidOut.toString());
    assert.equal(parsedPlasmid.success, true);
    assert.equal(parsedPlasmid.status, 'assimilated');
    assert.ok(parsedPlasmid.plasmids_count >= 1);
    console.log('  -> PASS: Assimilation de plasmide synchronisée avec succès.\n');

    // ------------------------------------------------------------------------
    // 7. Apoptose & Conscience Harmonisée
    // ------------------------------------------------------------------------
    console.log('[7/7] Apoptose & Conscience : dissonance cognitive et arrêt apoptotique');
    // Déclenchement par dépassement du seuil de dissonance
    const autopsy = await evaluateApoptosis({
      agentId: testAgent,
      triggerMetrics: {
        consecutiveFailures: 15,
        repetitionScore: 0.3,
        semanticDivergence: 0.8,
        hallucinations: 3,
        progressScore: 0
      },
      policy: {
        maxConsecutiveFailures: 20, // Ne déclenche pas sur les échecs seuls
        maxDissonanceThreshold: 40.0
      }
    });

    assert.equal(autopsy.apoptosisExecuted, true, 'Apoptose doit être exécutée quand la dissonance cognitive est excessive');
    assert.ok(autopsy.metricsSnapshot.dissonanceLevel >= 40.0, 'La dissonance doit être calculée');
    assert.ok(autopsy.triggerReason.includes('dissonance'), 'Le motif doit mentionner la dissonance cognitive');
    console.log('  -> PASS: Modèle de Conscience cognitive synchronisé avec l apoptose.\n');

    console.log('================================================================');
    console.log('   TOUS LES TESTS DE COHÉRENCE RUST <-> NODE ONT RÉUSSI (7/7)  ');
    console.log('================================================================');
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

runCoherenceSuite().catch((err) => {
  console.error('\nÉCHEC DU TEST DE COHÉRENCE :', err);
  process.exit(1);
});
