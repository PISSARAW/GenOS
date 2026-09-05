const assert = require('assert');
const proof = require('../src/services/safeDebuggingProofService');
const controller = require('../src/controllers/productProofController');

async function run() {
  console.log('=== TEST 1: Lecture des Preuves (readLatest) ===');
  const result = await proof.readLatest();
  assert.equal(result.available, true, 'La preuve doit être disponible');
  assert.equal(result.running, false, 'Aucune exécution en cours initialement');
  assert.equal(proof.validEvidence(result.evidence), true, 'Schéma de preuve valide');
  assert.equal(result.evidence.execution?.live, false, 'Fixture déterministe');
  assert.equal(result.evidence.selection?.winner, 'candidate-a', 'Le gagnant doit être candidate-a');
  console.log('  ✅ Lecture de l artefact safe-debugging validée.');

  console.log('\n=== TEST 2: Exécution de la Preuve (executeProof) ===');
  const executed = await proof.executeProof();
  assert.equal(executed.available, true);
  assert.equal(executed.running, false);
  assert.equal(proof.validEvidence(executed.evidence), true);
  assert.equal(executed.evidence.candidates.length, 3, '3 candidats évalués');
  assert.equal(executed.evidence.candidates.find((c) => c.name === 'candidate-a').tests_passed, 5);
  assert.equal(executed.evidence.selection.replay_verified, true, 'Replay vérifié avec succès');
  console.log('  ✅ Exécution réelle de bout en bout (run-demo.mjs) validée.');

  console.log('\n=== TEST 3: Méthodes gRPC (generateProof & verifyProof) ===');
  const generated = await proof.generateProof('safe-debugging', 'exec-test-1');
  assert(generated.hash && generated.hash.length === 64, 'Doit générer un hash SHA-256');
  assert(Array.isArray(generated.claims) && generated.claims.length === 3, 'Doit inclure 3 claims');
  assert.equal(proof.verifyProof(generated.hash), true, 'Le hash doit être vérifié');
  assert.equal(proof.verifyProof('invalid-hash'), false, 'Un hash invalide doit être rejeté');
  console.log('  ✅ Méthodes gRPC generateProof et verifyProof validées.');

  console.log('\n=== TEST 4: Contrôleur HTTP (productProofController) ===');
  let responseData = null;
  const mockRes = {
    json: (data) => { responseData = data; return mockRes; }
  };

  // 4.1 GET /api/product-proofs/safe-debugging
  await controller.getSafeDebugging({}, mockRes, (err) => { throw err; });
  assert.equal(responseData.available, true);
  console.log('  ✅ Contrôleur getSafeDebugging 200 OK');

  // 4.2 POST /api/product-proofs/safe-debugging/run
  responseData = null;
  await controller.runSafeDebugging({ user: { username: 'test-admin' } }, mockRes, (err) => { throw err; });
  assert.equal(responseData.available, true);
  assert.equal(responseData.evidence.selection.winner, 'candidate-a');
  console.log('  ✅ Contrôleur runSafeDebugging 200 OK');

  console.log('\n=============================================================');
  console.log('TOUS LES TESTS SAFE-DEBUGGING PROOF ONT RÉUSSI AVEC SUCCÈS !');
  console.log('=============================================================');
}

run().catch((error) => {
  console.error('Échec des tests safe-debugging proof:', error);
  process.exitCode = 1;
});

