const { generate } = require('./modelRouter.js');
const circuitBreaker = require('./circuitBreaker.js');
const immuneThreats = require('./immuneThreats.js');
const immuneJson = require('./immuneJson.js');

function scanThreats(target) {
    return immuneThreats.scanThreats(target);
}

function tripKillSwitch(reason = 'Immune system emergency stop') {
    return circuitBreaker.triggerHalt(String(reason), 'immune_system');
}

/**
 * Système Immunitaire Cognitif Global pour GenOS
 * Accessible par l'Agent, l'Orchestrateur, Griot et la A-Team.
 */

async function askLocalLLM(..._args) {
  const [prompt, complexity, agentId = 'griot', variantIndex = undefined, modelRouting = {}] = _args;
    try {
        const res = await generate({ agentId, prompt, complexity, maxTokens: 3000, variantIndex, ...modelRouting });
        return res.text || res.content || res.response || String(res);
    } catch (e) {
        return null;
    }
}

/**
 * Exécute un appel LLM avec validation immunitaire (Macrophages & Apoptose).
 * Intègre la Résilience Cellulaire (Pléiotropie et Cellules Souches).
 * Accepte l'objet d'options historique OU la forme positionnelle
 * (basePrompt, complexity, validatorFn, maxRetries, agentId,
 * stemCellFallback, variantIndex) utilisée par les appelants existants.
 *
 * @param {string|object} first Le prompt initial ou l'objet d'options
 */
async function withImmunity(first, ...rest) {
    const input = normalizeImmunityInput(first, rest);
    return runImmunityLoop(input);
}

function normalizeImmunityInput(first, rest) {
    if (first && typeof first === 'object' && !Array.isArray(first)) return first;
    const positional = rest || [];
    return {
        basePrompt: first,
        complexity: positional[0],
        validatorFn: positional[1],
        maxRetries: positional[2],
        agentId: positional[3],
        stemCellFallback: positional[4],
        variantIndex: positional[5]
    };
}

async function runImmunityLoop(input) {
    const source = input || {};
    const maxRetries = Number(source.maxRetries || 3);
    let currentPrompt = source.basePrompt;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // PLÉIOTROPIE & MUE : On combine l'index de mue de l'agent et l'essai courant pour changer de modèle.
        console.log(`[ImmuneSystem:${source.agentId || 'griot'}] Phagocytose... Essai ${attempt}/${maxRetries} (Pléiotropie/Mue: Modèle index ${immunityVariant(source, attempt)})`);
        const outcome = await attemptImmunity(source, currentPrompt, attempt);
        if (outcome.done) return outcome.value;
        currentPrompt = outcome.nextPrompt;
    }
    if (source.stemCellFallback) return source.stemCellFallback;
    return null;
}

function immunityVariant(input, attempt) {
    const base = input.variantIndex !== undefined ? input.variantIndex : 0;
    return base + (attempt - 1);
}

async function fetchImmunityResponse(input, prompt, attempt) {
    const fn = module.exports.askLocalLLM || askLocalLLM;
    const agent = input.agentId || 'griot';
    return fn(prompt, input.complexity, agent, immunityVariant(input, attempt));
}

function parseImmunityResponse(rawRes) {
    // PROTÉINE CHAPERON : Nettoyage syntaxique puis extraction du PREMIER
    // objet JSON équilibré (au lieu du plus externe glouton) ; repli sur le
    // DERNIER si le premier ne se parse pas. L'objet validé est parsé depuis
    // le texte extrait exact (même référence/texte garanti).
    const cleaned = String(rawRes).replace(/```json/g, '').replace(/```/g, '').trim();
    const candidate = immuneJson.extractJsonCandidate(cleaned);
    if (!candidate) throw new Error("Aucun objet JSON détecté.");
    const validated = immuneJson.parseJsonCandidate(candidate);
    if (validated.sourceText !== candidate.text) throw new Error("Aucun objet JSON détecté.");
    return validated.parsed;
}

async function attemptImmunity(input, prompt, attempt) {
    const maxRetries = Number(input.maxRetries || 3);
    const rawRes = await fetchImmunityResponse(input, prompt, attempt);
    if (!rawRes) {
        console.log(`[Apoptose:${input.agentId || 'griot'}] Mort silencieuse (pas de réponse).`);
        return { done: false, nextPrompt: prompt };
    }
    try {
        const parsed = parseImmunityResponse(rawRes);
        if (input.validatorFn) {
            input.validatorFn(parsed);
        }
        console.log(`[Homéostasie:${input.agentId || 'griot'}] Format validé.`);
        return { done: true, value: parsed };
    } catch (error) {
        console.warn(`[Inflammation:${input.agentId || 'griot'}] Mutation détectée : ${error.message}`);
        return immunityRetry(input, { prompt, attempt, maxRetries, error });
    }
}

function immunityRetry(input, state) {
    if (state.attempt >= state.maxRetries) {
        console.error(`[Apoptose Cellulaire:${input.agentId || 'griot'}] Échec irrécupérable.`);
        if (input.stemCellFallback) {
            console.log(`[Stem Cells:${input.agentId || 'griot'}] Apoptose interceptée. Activation de la Cellule Souche (Fallback).`);
            return { done: true, value: input.stemCellFallback };
        }
        return { done: true, value: null };
    }
    // Signal de Douleur au LLM
    return { done: false, nextPrompt: painPromptFor(input.basePrompt, state.error) };
}

function painPromptFor(basePrompt, error) {
    const message = error && error.message ? error.message : String(error);
    return `${basePrompt}\n\n[ERREUR CRITIQUE] Ta tentative précédente a muté avec cette erreur : "${message}". 
            CORRIGE TON ERREUR. Formate EXACTEMENT comme demandé sans ajout.`;
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
        let rawRes = await fn(currentPrompt, complexity, agentId, currentVariant, opts.modelRouting || {});
        
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
                if (opts.stemCellFallback) {
                    opts.onFallback?.(e);
                    return opts.stemCellFallback;
                }
                return null;
            }
            if (e.message && e.message.includes('Repetition excessive')) {
                currentPrompt = `${basePrompt}\n\n[CONSIGNE COGNITIVE] Diversifie ton vocabulaire, évite les répétitions et fournis une réponse directe et concise.`;
            } else {
                currentPrompt = `${basePrompt}\n\n[ERREUR STRUCTURELLE] Ton texte n'a pas respecté l'architecture imposée : "${e.message}". 
                CORRIGE TON ERREUR et renvoie tout le texte avec la structure exacte demandée.`;
            }
        }
    }
    if (opts.stemCellFallback) opts.onFallback?.(new Error('No valid model response.'));
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

function heuristicReconstruction(raw, err) {
    const text = String(raw || '');
    const outcomeMatch = text.match(/"outcome"\s*:\s*"([^"]+)"/i);
    const parsedClaims = immuneJson.extractClaimsFromText(text);
    const statementMatches = [...text.matchAll(/"statement"\s*:\s*"([^"]+)"/gi)];

    if (!outcomeMatch && !parsedClaims && statementMatches.length === 0) {
        return null;
    }

    const outcome = String(outcomeMatch?.[1] || 'failed').trim().toLowerCase();
    let claims = parsedClaims || [];
    if (!claims.length && statementMatches.length) {
        claims = statementMatches.map(m => ({ statement: m[1], evidence: [] }));
    }
    return {
        author: { name: 'ChaperoneRestored', meaning: 'Restauré par le Chaperon Moléculaire' },
        outcome,
        claims: claims.length ? claims : [{ statement: 'Sortie extraite par le Chaperon Moléculaire.', evidence: [] }],
        unverifiedClaims: claims.some(c => !c.evidence || c.evidence.length === 0)
            ? ['Affirmation(s) extraite(s) par le Chaperon Moléculaire sans preuve structurelle']
            : [],
        uncertainties: ['Structure JSON partiellement reconstituée par heuristique immunitaire.']
    };
}

function chaperoneRepairJson(rawText, validatorFn = null) {
    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
        return { ok: false, error: 'Empty output', painSignal: formatPainSignal('Sortie vide ou absente') };
    }
    const cleaned = immuneJson.cleanMarkdownAndNoise(rawText);
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

/**
 * Chaperonne une sortie textuelle d'agent en la purifiant via outputGovernor
 * et en évaluant sa santé cognitive via cognitiveMonitor.
 * @param {string} rawText
 * @param {object} options
 * @returns {{ purifiedText: string, health: object, warning: boolean }}
 */
function chaperoneAgentOutput(rawText, options = {}) {
    if (!rawText || typeof rawText !== 'string') {
        return {
            purifiedText: '',
            health: { health_score: 1.0, repetition_score: 0, topic_alignment: 1.0, semantic_drift: 0 },
            warning: false
        };
    }

    const purifiedText = enforceOutputContract(rawText, {
        stripPreamble: options.stripPreamble !== false,
        stripPostamble: options.stripPostamble !== false,
        format: options.format || 'markdown'
    });

    const expectedTerms = options.expectedTerms || (options.prompt ? options.prompt.split(/\s+/).filter(w => w.length > 5).slice(0, 5) : []);
    const health = evaluateCognitiveHealth(purifiedText, expectedTerms, options.forbiddenTerms || []);

    return {
        purifiedText,
        health,
        warning: health.health_score < 0.6
    };
}

module.exports = {
    scanThreats,
    tripKillSwitch,
    withImmunity,
    withTextImmunity,
    chaperoneAgentOutput,
    askLocalLLM,
    formatPainSignal,
    evaluateCognitiveDrift,
    chaperoneRepairJson,
    phagocytoseCodexReport
};

