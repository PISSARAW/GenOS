const { generate } = require('./modelRouter.js');

/**
 * Système Immunitaire Cognitif Global pour GenOS
 * Accessible par l'Agent, l'Orchestrateur, Griot et la A-Team.
 */

async function askLocalLLM(prompt, complexity, agentId = 'griot') {
    try {
        const res = await generate({ agentId, prompt, complexity, maxTokens: 3000 });
        return res.text || res.content || res.response || String(res);
    } catch (e) {
        return null;
    }
}

/**
 * Exécute un appel LLM avec validation immunitaire (Macrophages & Apoptose).
 * Intègre la Résilience Cellulaire (Pléiotropie et Cellules Souches).
 * 
 * @param {string} basePrompt Le prompt initial
 * @param {string} complexity Complexité ('low', 'medium', 'high')
 * @param {Function} validatorFn Fonction de validation qui throw une erreur si muté
 * @param {number} maxRetries Nombre d'essais avant apoptose
 * @param {string} agentId L'identité de l'agent qui fait l'appel
 * @param {any} stemCellFallback (Optionnel) Valeur de secours "Cellule Souche" retournée en cas d'Apoptose
 */
async function withImmunity(basePrompt, complexity, validatorFn, maxRetries = 3, agentId = 'griot', stemCellFallback = null) {
    let currentPrompt = basePrompt;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // PLÉIOTROPIE : Si on est au 2e essai, on pourrait signaler au routeur de changer de modèle.
        // On passe 'pleiotropyAttempt: attempt' pour que le modelRouter puisse (à l'avenir) pivoter de Llama à Mistral.
        console.log(`[ImmuneSystem:${agentId}] Phagocytose... Essai ${attempt}/${maxRetries} (Pléiotropie: ${attempt > 1 ? 'Active' : 'Inactive'})`);
        const rawRes = await askLocalLLM(currentPrompt, complexity, agentId);
        
        if (!rawRes) {
            console.log(`[Apoptose:${agentId}] Mort silencieuse (pas de réponse).`);
            continue;
        }

        try {
            // PROTÉINE CHAPERON : Nettoyage syntaxique agressif
            let cleanJson = rawRes.replace(/```json/g, '').replace(/```/g, '').trim();
            const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("Aucun objet JSON détecté.");
            
            const parsed = JSON.parse(jsonMatch[0]);
            
            if (validatorFn) {
                validatorFn(parsed);
            }
            
            console.log(`[Homéostasie:${agentId}] Format validé.`);
            return parsed;
        } catch (e) {
            console.warn(`[Inflammation:${agentId}] Mutation détectée : ${e.message}`);
            if (attempt === maxRetries) {
                console.error(`[Apoptose Cellulaire:${agentId}] Échec irrécupérable.`);
                
                // CELLULE SOUCHE (STEM CELL FALLBACK)
                if (stemCellFallback) {
                    console.log(`[Stem Cells:${agentId}] Apoptose interceptée. Activation de la Cellule Souche (Fallback).`);
                    return stemCellFallback;
                }
                return null;
            }
            // Signal de Douleur au LLM
            currentPrompt = `${basePrompt}\n\n[ERREUR CRITIQUE] Ta tentative précédente a muté avec cette erreur : "${e.message}". 
            CORRIGE TON ERREUR. Formate EXACTEMENT comme demandé sans ajout.`;
        }
    }
    
    return stemCellFallback || null;
}

module.exports = {
    withImmunity,
    askLocalLLM
};
