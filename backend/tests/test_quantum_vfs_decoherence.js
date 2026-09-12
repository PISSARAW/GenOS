/**
 * @file test_quantum_vfs_decoherence.js
 * @description Test d'intégration globale du Point 7 : Décohérence Quantique.
 * Vérifie l'orchestration unifiée des 7 piliers et la transition vers l'espace classique.
 */

const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

const {
  QuantumDecoherenceEngine,
  ObservableTrigger,
  EntanglementMode
} = require('../src/services/quantumVfs');

async function runDecoherenceIntegrationTest() {
  console.log('[TEST] === Démarrage du Test Intégration : Décohérence Quantique (Point 7) ===');

  const tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'quantum-vfs-decoherence-'));
  console.log(`[TEST] Workspace temporaire de test : ${tmpWorkspace}`);

  try {
    const engine = new QuantumDecoherenceEngine({
      workspaceRoot: tmpWorkspace,
      deltaXLimit: 0.05,
      deltaPLimit: 0.05
    });

    // 1. Stage quantum files with superposition hypotheses
    console.log('\n--- 1. Étape de Superposition Quantique ---');
    const file1 = 'src/models/userModel.ts';
    const initialContent1 = 'export interface UserModel { id: string; }';
    const { superposition: sup1 } = engine.stageQuantumFile(file1, initialContent1, {
      energy: 1.5,
      hypotheses: [
        { label: 'add_email_field', content: 'export interface UserModel { id: string; email: string; }', weight: 4.0 },
        { label: 'add_name_field', content: 'export interface UserModel { id: string; name: string; }', weight: 1.0 }
      ]
    });
    assert.strictEqual(sup1.eigenstates.size, 3);
    console.log(`[OK] Fichier ${file1} stagé avec 3 états propres en superposition.`);

    const file2 = 'src/services/userService.ts';
    const initialContent2 = 'export class UserService { getUser() {} }';
    const { superposition: sup2 } = engine.stageQuantumFile(file2, initialContent2, {
      energy: 2.0,
      hypotheses: [
        { label: 'email_resolver', content: 'export class UserService { getByEmail(e: string) {} }', weight: 5.0 }
      ]
    });
    console.log(`[OK] Fichier ${file2} stagé avec états propres alternatifs.`);

    // 2. Intrication quantique entre les deux fichiers
    console.log('\n--- 2. Intrication Quantique des Fichiers ---');
    engine.entanglement.entangle(file1, file2, EntanglementMode.INTERFACE_IMPLEMENTATION, [{ invariant: 'model_service_sync' }]);
    assert.strictEqual(engine.entanglement.pairs.size, 1);
    console.log(`[OK] Paire EPR intriquée créée entre ${file1} et ${file2}.`);

    // 3. Effet tunnel pour écriture concurrente
    console.log('\n--- 3. Effet Tunnel sous verrouillage ---');
    engine.tunneling.setBarrier(file1, 3.0, 1.0, 'MUTEX_LOCK');
    const tunnelResult = engine.tunneling.writeWithTunneling(
      file1,
      'export interface UserModel { id: string; email: string; role: string; }',
      10.0 // Haute impulsion pour traverser la barrière
    );
    assert.strictEqual(tunnelResult.tunneled, true);
    console.log(`[OK] Écriture par effet tunnel réussie (status: ${tunnelResult.status}).`);

    // 4. Vérification de l'état cohérent avant mesure macroscopique
    console.log('\n--- 4. Métriques de cohérence avant mesure ---');
    const preMetrics = engine.getCoherenceMetrics();
    assert.strictEqual(preMetrics.isDecohered, false);
    assert.strictEqual(preMetrics.activeSuperpositionsCount, 2);
    console.log('[OK] Métriques de cohérence valides, système non encore décohérent.');

    // 5. Déclenchement de la Décohérence Quantique (mesure macroscopique par test unitaires)
    console.log('\n--- 5. Déclenchement de la Décohérence Macroscopique ---');
    const decoherenceReport = await engine.triggerDecoherence(ObservableTrigger.UNIT_TEST_EXECUTION, {
      strategy: 'highest_probability',
      writeToDisk: true
    });

    assert.strictEqual(decoherenceReport.success, true);
    assert.strictEqual(decoherenceReport.trigger, ObservableTrigger.UNIT_TEST_EXECUTION);
    assert.strictEqual(decoherenceReport.crystallizedCount, 2);
    assert.strictEqual(engine.isDecohered, true);
    console.log(`[OK] Décohérence achevée en ${decoherenceReport.coherenceDurationMs}ms.`);

    // 6. Vérification de la matérialisation physique sur le disque
    console.log('\n--- 6. Vérification de la Cristallisation Physique ---');
    const physicalPath1 = path.join(tmpWorkspace, file1);
    assert.strictEqual(fs.existsSync(physicalPath1), true);
    const diskContent1 = fs.readFileSync(physicalPath1, 'utf8');
    assert.strictEqual(diskContent1.includes('email: string'), true);
    console.log(`[OK] Fichier physique ${file1} matérialisé sur disque avec le contenu effondré optimal.`);

    const postMetrics = engine.getCoherenceMetrics();
    assert.strictEqual(postMetrics.isDecohered, true);
    console.log('[OK] Métriques post-décohérence confirmées (isDecohered = true).');

    console.log('\n[RÉSULTAT] => Tous les 7 piliers du Quantum VFS fonctionnent en parfaite harmonie !');
  } finally {
    // Nettoyage sécurisé du répertoire temporaire
    fs.rmSync(tmpWorkspace, { recursive: true, force: true });
    console.log('[CLEANUP] Workspace temporaire supprimé avec succès.');
  }
}

runDecoherenceIntegrationTest().catch((err) => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
