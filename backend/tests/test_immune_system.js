const assert = require('assert');
const { withImmunity } = require('../src/services/immuneSystem.js');

console.log("=== TESTS : COGNITIVE IMMUNE SYSTEM ===");

// Simulation d'une fonction de génération (mock de modelRouter)
// Pour les tests, on va surcharger la méthode localement
const immuneSys = require('../src/services/immuneSystem.js');

let callCount = 0;
immuneSys.askLocalLLM = async (prompt) => {
    callCount++;
    if (callCount === 1) {
        // Le LLM mute et renvoie un mauvais format (String au lieu de JSON)
        return "Ceci n'est pas un JSON";
    }
    if (callCount === 2) {
        // Le LLM renvoie un JSON muté (Objet au lieu de String pour le titre)
        return `{"titre": {"valeur": "Un objet interdit"}}`;
    }
    if (callCount === 3) {
        // Le LLM a compris la "douleur" et corrige
        return `{"titre": "Titre valide"}`;
    }
    return null;
};

async function runTests() {
    console.log("Test 1: Réponse inflammatoire et Auto-Correction (Homéostasie)");
    
    const validator = (data) => {
        if (!data.titre) throw new Error("Attribut 'titre' manquant.");
        if (typeof data.titre !== 'string') throw new Error("Le 'titre' DOIT être une string.");
    };

    const result = await immuneSys.withImmunity("Génère un titre", 'low', validator, 3, 'test_agent');
    
    assert.ok(result);
    assert.strictEqual(result.titre, "Titre valide");
    assert.strictEqual(callCount, 3); // Il a fallu 3 essais pour que le LLM corrige ses mutations
    
    console.log("-> Succès : L'inflammation a forcé la correction (Homéostasie atteinte).");
    console.log("=== TOUS LES TESTS SONT PASSÉS ===");
}

runTests().catch(e => {
    console.error("Échec :", e);
    process.exit(1);
});
