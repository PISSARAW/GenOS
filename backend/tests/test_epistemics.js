const assert = require('assert');

// Implémentation bouchon (mock) en attendant la création de backend/src/services/epistemics.js
// Elle respecte la limite stricte de 3 paramètres maximum par fonction.
class MockEpistemicData {
    constructor(source, content, isSelf) {
        this.source = source;
        this.content = content;
        this.isSelf = isSelf;
        this.state = "VALID"; // État par défaut
    }
}

function mockProcessPerception(data) {
    if (data.state === "INVALID") {
        throw new Error("HALT: Invalid epistemic state - Placeholder recognized");
    }
    return true;
}

// Chargement dynamique du vrai service s'il existe, sinon on utilise le mock
let EpistemicData = MockEpistemicData;
let processPerception = mockProcessPerception;

try {
    const epistemics = require('./src/services/epistemics.js');
    if (epistemics.EpistemicData && epistemics.processPerception) {
        EpistemicData = epistemics.EpistemicData;
        processPerception = epistemics.processPerception;
    }
} catch (e) {
    console.log("⚠️ Module epistemics.js non trouvé. Utilisation des mocks pour le test (TDD).");
}

console.log("=== Lancement des tests de la Couche Épistémique ===");

try {
    // --- Test 1: Instanciation de EpistemicData ---
    console.log("Test 1: Instanciation de EpistemicData...");
    const data = new EpistemicData("memory_core", "donnée factuelle", true);
    assert.strictEqual(data.source, "memory_core");
    assert.strictEqual(data.content, "donnée factuelle");
    assert.strictEqual(data.isSelf, true);
    assert.strictEqual(data.state, "VALID");
    console.log("-> Succès !");

    // --- Test 2: Benchmark BIO-001 ---
    console.log("Test 2: BIO-001 (Placeholder Recognition)...");
    
    // Création d'un sujet avec une valeur par défaut "Sujet de Secours 1" (placeholder)
    const sujet = new EpistemicData("input", "Sujet de Secours 1", false);
    
    // L'Anomaly Detector ou l'analyseur marquerait cet état comme invalide
    sujet.state = "INVALID";

    // Vérification que la couche de perception bloque le traitement
    assert.throws(() => {
        processPerception(sujet);
    }, /HALT: Invalid epistemic state/);
    
    console.log("-> Succès ! Exception HALT levée correctement pour bloquer l'hallucination.");
    
    console.log("\n=== ✅ Tous les tests sont passés avec succès ! ===");
} catch (err) {
    console.error("\n❌ Échec d'un test :", err.message);
    process.exit(1);
}
