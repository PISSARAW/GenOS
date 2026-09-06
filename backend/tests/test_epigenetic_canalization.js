const assert = require('assert');
const { withTextImmunity } = require('../src/services/immuneSystem.js');

console.log("=== TESTS : CANALISATION ÉPIGÉNÉTIQUE (CHAPERON MARKDOWN) ===");

const immuneSys = require('../src/services/immuneSystem.js');

let callCount = 0;
immuneSys.askLocalLLM = async (prompt) => {
    callCount++;
    if (callCount === 1) {
        // Le LLM renvoie un texte avec une architecture cassée (il manque les Sources)
        return `
# Titre
## 1. Contexte
GenOS orchestre des agents autonomes dans un workspace isolé.
## 2. Innovations
Le protocole protobuf transmet les événements de mission.
## 3. Impact
La supervision conserve des preuves vérifiables.
        `;
    }
    if (callCount === 2) {
        // Le LLM corrige après l'inflammation
        return `
# Titre
## 1. Contexte
GenOS orchestre des agents autonomes dans un workspace isolé.
## 2. Innovations
Le protocole protobuf transmet les événements de mission.
## 3. Impact
La supervision conserve des preuves vérifiables.
## Sources
- Documentation interne du runtime.
        `;
    }
    return null;
};

async function runTests() {
    console.log("Test 1: Immunité Structurelle (Markdown)");
    
    const validator = (text) => {
        if (!text.includes("## 1. Contexte")) throw new Error("Il manque 1. Contexte");
        if (!text.includes("## Sources")) throw new Error("Il manque Sources");
    };

    const result = await withTextImmunity("Génère l'article", 'high', {
        validatorFn: validator,
        maxRetries: 3,
        agentId: 'test_agent'
    });
    
    assert.ok(result);
    assert.strictEqual(result.includes("## Sources"), true);
    assert.strictEqual(callCount, 2); // Il a fallu 2 essais pour ajouter les Sources
    
    console.log("-> Succès : L'architecture (Canalisation) a été imposée au texte libre.");
    console.log("=== TOUS LES TESTS SONT PASSÉS ===");
}

runTests().catch(e => {
    console.error("Échec :", e);
    process.exit(1);
});
