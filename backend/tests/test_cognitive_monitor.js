const { evaluateCognitiveHealth } = require('./src/services/cognitiveMonitor.js');
const assert = require('assert');

// Mock simple pour executer les tests
function runTest(testName, testFn) {
    try {
        testFn();
        console.log(`[PASS] ${testName}`);
    } catch (error) {
        console.error(`[FAIL] ${testName}`);
        console.error(error);
    }
}

// Test 1: Simulation d'Écholalie (Attention Loop)
runTest('Attention Loop (Écholalie) détectée avec précision', () => {
    const echolaliaText = "Nous utilisons la technologie 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D 3D.";
    const expectedTerms = ["technologie", "modélisation"];
    
    // On s'attend à ce que evaluateCognitiveHealth retourne un objet avec repetition_score et health_score
    const result = evaluateCognitiveHealth(echolaliaText, expectedTerms, []);
    
    assert.ok(result.repetition_score > 0.7, 'Le score de répétition doit être élevé (> 0.7).');
    assert.ok(result.health_score < 0.5, 'Le score de santé globale doit chuter (< 0.5).');
});

// Test 2: Simulation de Dérive Sémantique (Schizophasie)
runTest('Semantic Drift (Schizophasie) détectée avec précision', () => {
    const driftingText = "L'Europe a connu des bouleversements majeurs durant la Révolution Française de 1789, menant à la chute de la monarchie.";
    const expectedTerms = ["afrique", "innovation", "technologie"];
    const forbiddenTerms = ["europe", "révolution", "france"];
    
    // On s'attend à ce que evaluateCognitiveHealth retourne un objet avec semantic_drift et health_score
    const result = evaluateCognitiveHealth(driftingText, expectedTerms, forbiddenTerms);
    
    assert.ok(result.semantic_drift > 0.6, 'La dérive sémantique doit être élevée car le sujet ne correspond pas (> 0.6).');
    assert.ok(result.health_score < 0.6, 'Le score de santé globale doit être impacté par la dérive sémantique (< 0.6).');
});

console.log("Tests du Cognitive Health Monitor terminés.");
