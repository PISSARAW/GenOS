const { generate } = require('./modelRouter.js');

/**
 * Système Immunitaire Cognitif Global pour GenOS
 * Accessible par l'Agent, l'Orchestrateur, Griot et la A-Team.
 */

async function askLocalLLM(prompt, complexity, agentId = 'griot', variantIndex = undefined) {
    try {
        const res = await generate({ agentId, prompt, complexity, maxTokens: 3000, variantIndex });
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
 * @param {number} variantIndex (Optionnel) Index pour forcer la Mue Cognitive d'un agent.
 */
async function withImmunity(basePrompt, complexity, validatorFn, maxRetries = 3, agentId = 'griot', stemCellFallback = null, variantIndex = undefined) {
    let currentPrompt = basePrompt;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // PLÉIOTROPIE & MUE : On combine l'index de mue de l'agent et l'essai courant pour changer de modèle.
        const currentVariant = (variantIndex !== undefined ? variantIndex : 0) + (attempt - 1);
        
        console.log(`[ImmuneSystem:${agentId}] Phagocytose... Essai ${attempt}/${maxRetries} (Pléiotropie/Mue: Modèle index ${currentVariant})`);
        const rawRes = await askLocalLLM(currentPrompt, complexity, agentId, currentVariant);
        
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

const { evaluateCognitiveHealth } = require('./cognitiveMonitor.js');
const { enforceOutputContract } = require('./outputGovernor.js');

/**
 * Exécute un appel LLM avec validation immunitaire pour du TEXTE BRUT (Markdown).
 * (Chaperon Structurel Épigénétique)
 */
async function withTextImmunity(basePrompt, complexity, opts = {}) {
    let currentPrompt = basePrompt;
    const maxRetries = opts.maxRetries || 3;
    const agentId = opts.agentId || 'griot';
    
    // Extraction de mots-clés du prompt pour le moniteur
    const expectedTerms = basePrompt.split(/\s+/).filter(w => w.length > 5).slice(0, 5);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const currentVariant = (opts.variantIndex !== undefined ? opts.variantIndex : 0) + (attempt - 1);
        console.log(`[ImmuneSystem-Text:${agentId}] Phagocytose Structurelle... Essai ${attempt}/${maxRetries} (Pléiotropie: Modèle index ${currentVariant})`);
        
        let rawRes = await askLocalLLM(currentPrompt, complexity, agentId, currentVariant);
        
        if (!rawRes) {
            console.log(`[Apoptose-Text:${agentId}] Mort silencieuse.`);
            continue;
        }

        try {
            // OUTPUT GOVERNOR: Purification du texte avant évaluation cognitive
            rawRes = enforceOutputContract(rawRes, {
                format: 'markdown',
                stripPreamble: true,
                stripPostamble: true
            });

            let cleanText = rawRes.trim();
            cleanText = cleanText.replace(/^```markdown/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();

            // Moniteur Cognitif
            const health = evaluateCognitiveHealth(cleanText, expectedTerms, opts.forbiddenTerms || []);
            
            if (health.health_score < 0.3) {
                throw new Error("ANOMALY: Repetition excessive détectée. Abort trajectory.");
            }
            if (health.health_score < 0.6) {
                throw new Error("ANOMALY: Dérive sémantique détectée. Re-concentre ton attention sur le sujet initial et évite le hors-sujet.");
            }

            if (opts.validatorFn) {
                opts.validatorFn(cleanText);
            }
            
            console.log(`[Homéostasie-Text:${agentId}] Structure Markdown validée.`);
            return cleanText;
        } catch (e) {
            console.warn(`[Inflammation-Text:${agentId}] Mutation structurelle détectée : ${e.message}`);
            if (attempt === maxRetries) {
                console.error(`[Apoptose-Text:${agentId}] Échec irrécupérable de la structure.`);
                if (opts.stemCellFallback) return opts.stemCellFallback;
                return null;
            }
            currentPrompt = `${basePrompt}\n\n[ERREUR STRUCTURELLE] Ton texte n'a pas respecté l'architecture imposée : "${e.message}". 
            CORRIGE TON ERREUR et renvoie tout le texte avec la structure exacte demandée.`;
        }
    }
    return opts.stemCellFallback || null;
}

module.exports = {
    withImmunity,
    withTextImmunity,
    askLocalLLM
};
