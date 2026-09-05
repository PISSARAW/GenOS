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
        const fn = module.exports.askLocalLLM || askLocalLLM;
        const rawRes = await fn(currentPrompt, complexity, agentId, currentVariant);
        
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
        const fn = module.exports.askLocalLLM || askLocalLLM;
        let rawRes = await fn(currentPrompt, complexity, agentId, currentVariant);
        
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

function formatPainSignal(errorMessage, context = '') {
    const detail = String(errorMessage || 'Mutation structurelle inconnue').trim();
    const snippet = context ? ` Contexte: ${String(context).slice(0, 150)}` : '';
    return `[SIGNAL IMMUNITAIRE : DOULEUR COGNITIVE] Ton rapport a muté avec l'erreur : "${detail}".${snippet} RÈGLE STRICTE : Produis un JSON valide sans préambule, sans code markdown non fermé, contenant "author", "outcome", "claims".`;
}

function evaluateCognitiveDrift(text, options = {}) {
    if (!text || typeof text !== 'string') {
        return { healthy: true, health: { health_score: 1.0 }, warning: false };
    }
    const clean = text.trim();
    const expectedTerms = options.expectedTerms || clean.split(/\s+/).filter(w => w.length > 5).slice(0, 5);
    const health = evaluateCognitiveHealth(clean, expectedTerms, options.forbiddenTerms || []);
    return {
        healthy: health.health_score >= 0.5,
        warning: health.health_score < 0.5,
        health
    };
}

function cleanMarkdownAndNoise(raw) {
    let text = String(raw || '').trim();
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) text = match[0];
    text = text.replace(/,\s*([}\]])/g, '$1');
    return text;
}

function heuristicReconstruction(raw, err) {
    const text = String(raw || '');
    const outcomeMatch = text.match(/"outcome"\s*:\s*"([^"]+)"/i);
    const claimsMatch = text.match(/"claims"\s*:\s*(\[[^\]]*\])/i);
    const statementMatches = [...text.matchAll(/"statement"\s*:\s*"([^"]+)"/gi)];

    if (!outcomeMatch && !claimsMatch && statementMatches.length === 0) {
        return null;
    }

    const outcome = outcomeMatch ? outcomeMatch[1] : (/réussi|success|completed/i.test(text) ? 'success' : 'failed');
    let claims = [];
    if (claimsMatch) {
        try { claims = JSON.parse(claimsMatch[1]); } catch (_) {}
    }
    if (!claims.length && statementMatches.length) {
        claims = statementMatches.map(m => ({ statement: m[1], evidence: ['chaperone_reconstructed'] }));
    }
    return {
        author: { name: 'ChaperoneRestored', meaning: 'Restauré par le Chaperon Moléculaire' },
        outcome: outcome || 'success',
        claims: claims.length ? claims : [{ statement: 'Sortie extraite par le Chaperon Moléculaire.', evidence: ['macrophage_recovery'] }],
        uncertainties: ['Structure JSON partiellement reconstituée par heuristique immunitaire.']
    };
}

function chaperoneRepairJson(rawText, validatorFn = null) {
    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
        return { ok: false, error: 'Empty output', painSignal: formatPainSignal('Sortie vide ou absente') };
    }
    const cleaned = cleanMarkdownAndNoise(rawText);
    let parsed = null;
    let repaired = false;
    let heuristic = false;

    try {
        parsed = JSON.parse(cleaned);
        repaired = cleaned !== rawText.trim();
    } catch (parseError) {
        const reconstructed = heuristicReconstruction(rawText, parseError);
        if (reconstructed) {
            parsed = reconstructed;
            repaired = true;
            heuristic = true;
        } else {
            return { ok: false, error: parseError.message, painSignal: formatPainSignal(parseError.message, rawText) };
        }
    }

    if (validatorFn && typeof validatorFn === 'function') {
        try {
            validatorFn(parsed);
        } catch (valErr) {
            return { ok: false, error: valErr.message, painSignal: formatPainSignal(valErr.message, rawText) };
        }
    }

    return { ok: true, data: parsed, repaired, heuristic };
}

function phagocytoseCodexReport(rawText, options = {}) {
    const agentName = options.agentName || 'GenOS Agent';
    const nameMeaning = options.nameMeaning || 'Autonomous agent';
    const role = options.role || 'Autonomous implementation agent';

    const repair = chaperoneRepairJson(rawText, (data) => {
        if (data && !Array.isArray(data.claims)) throw new Error("L'attribut 'claims' doit être un tableau.");
    });

    if (repair.ok) {
        const report = repair.data;
        report.author = report.author || { name: agentName, meaning: nameMeaning, role };
        if (!Array.isArray(report.claims)) report.claims = [];
        return { ok: true, report, repaired: repair.repaired, heuristic: repair.heuristic };
    }

    return {
        ok: false,
        error: repair.error,
        painSignal: repair.painSignal,
        fallbackReport: {
            author: { name: agentName, meaning: nameMeaning, role },
            outcome: 'failed',
            failure: {
                category: 'mutated_output',
                reason: repair.painSignal,
                evidence: [repair.error || 'Syntax mutation']
            },
            claims: [],
            unverifiedClaims: ["Le rapport a muté et n'a pas pu être réparé par le Chaperon Moléculaire."]
        }
    };
}

module.exports = {
    withImmunity,
    withTextImmunity,
    askLocalLLM,
    formatPainSignal,
    evaluateCognitiveDrift,
    chaperoneRepairJson,
    phagocytoseCodexReport
};
