'use strict';

/**
 * Cognitive Key System — genèse de nouvelles clés (ADR 0033, point 10).
 *
 * Permettre à GenOS de créer de NOUVELLES CognitiveKeys — mais
 * uniquement après validation expérimentale. C'est la contrainte
 * cardinale du plan : « GenOS pourrait découvrir de nouvelles méthodes
 * de pensée qui n'existent pas dans le catalogue initial ».
 *
 * Pipeline en trois étages, chacun refuse (fail-closed) :
 *
 *  1. CANDIDATURE — une combinaison de clés récurrente dans des
 *     recettes performantes devient candidate à l'abstraction : si les
 *     clés {A, B} co-occurrent dans ≥ minOccurrences recettes dont la
 *     performance mesurée est positive, la paire est une candidate.
 *     La candidate porte une instruction COMPOSÉE (la séquence des
 *     instructions des clés sources) — pas une instruction inventée.
 *
 *  2. PROPOSITION — la candidate devient une clé proposée : ID
 *     généré, opération = composition déclarée des opérations sources
 *     (l'enum n'est PAS étendu silencieusement : la proposition porte
 *     `composedOf` et son admission est un changement de contrat
 *     explicite), provenance = les clés sources (pas un philosophe).
 *
 *  3. VALIDATION EXPÉRIMENTALE — une proposition n'entre AU JAMAIS au
 *     registre sans preuve : `evidence` doit contenir des runs
 *     mesurés (nombre de missions, gain observé vs témoin, contexte).
 *     Le gate rejette toute admission sans preuve — y compris les
 *     propositions plausibles. C'est le point 10 du plan : la
 *     validation expérimentale précède l'admission, toujours.
 *
 * Ce module ne fait pas de LLM : il structure la genèse. La rédaction
 * d'une instruction véritablement nouvelle (pas composée) appartient
 * à un processus supervisé en aval.
 */

const { COGNITIVE_KEYS } = require('./cognitiveKeyDefinitions');
const { validateRegistry } = require('./cognitiveKeyRegistry');

const DEFAULTS = {
  minOccurrences: 2,
  minPerformance: 1
};

function pairKey(a, b) {
  return [a, b].sort().join('+');
}

/**
 * Étage 1 — candidatures : paires de clés co-occurrentes dans des
 * recettes performantes.
 */
function findCandidates({ recipes, performance, options }) {
  const config = { ...DEFAULTS, ...(options || {}) };
  const performed = (recipes || []).filter((recipe) => (performance[recipe.id] || 0) >= config.minPerformance);
  const cooccurrences = new Map();
  performed.forEach((recipe) => {
    const keys = [...recipe.keys].sort();
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        const id = pairKey(keys[i], keys[j]);
        if (!cooccurrences.has(id)) cooccurrences.set(id, { keys: [keys[i], keys[j]], recipes: [] });
        cooccurrences.get(id).recipes.push(recipe.id);
      }
    }
  });
  return [...cooccurrences.values()]
    .filter((entry) => entry.recipes.length >= config.minOccurrences)
    .map((entry) => ({
      keyPair: entry.keys,
      occurrences: entry.recipes.length,
      sourceRecipes: entry.recipes
    }));
}

function composedOperation(keyPair, keyMap) {
  return keyPair.map((keyId) => (keyMap.get(keyId) || {}).operation).filter(Boolean).join('-then-');
}

function composedInstruction(keyPair, keyMap) {
  return keyPair
    .map((keyId) => (keyMap.get(keyId) || {}).instruction)
    .filter(Boolean)
    .join(' ');
}

function mergedArrayField({ keyA, keyB, field, excluded = [] }) {
  return [...new Set([...(keyA[field] || []), ...(keyB[field] || [])])]
    .filter((id) => !excluded.includes(id));
}

function mergedCost(keyA, keyB) {
  if (keyA.cost === 'high' || keyB.cost === 'high') return 'high';
  if (keyA.cost === 'medium' || keyB.cost === 'medium') return 'medium';
  return 'low';
}

function genesisMeta(candidate) {
  return {
    stage: 'proposed',
    occurrences: candidate.occurrences,
    sourceRecipes: candidate.sourceRecipes,
    proposedAt: new Date().toISOString()
  };
}

/**
 * Étage 2 — propositions : la candidate devient une clé proposée avec
 * provenance structurelle (les clés sources, pas un philosophe).
 */
function proposeKey(candidate, keyMap) {
  const [a, b] = candidate.keyPair;
  const keyA = keyMap.get(a);
  const keyB = keyMap.get(b);
  if (!keyA || !keyB) return null;
  const instruction = composedInstruction(candidate.keyPair, keyMap);
  if (instruction.length < 40) return null;
  const pair = { keyA, keyB };
  return {
    id: `cognitive.${a.replace('cognitive.', '')}-with-${b.replace('cognitive.', '')}`,
    label: `${keyA.label} + ${keyB.label}`,
    operation: composedOperation(candidate.keyPair, keyMap),
    instruction,
    questions: [...(keyA.questions || []), ...(keyB.questions || [])].slice(0, 4),
    inputs: mergedArrayField({ ...pair, field: 'inputs' }),
    outputs: mergedArrayField({ ...pair, field: 'outputs' }),
    usefulWhen: mergedArrayField({ ...pair, field: 'usefulWhen' }),
    failureModes: mergedArrayField({ ...pair, field: 'failureModes' }),
    compatibleWith: mergedArrayField({ ...pair, field: 'compatibleWith', excluded: [a, b] }),
    conflictsWith: mergedArrayField({ ...pair, field: 'conflictsWith', excluded: [a, b] }),
    cost: mergedCost(keyA, keyB),
    evidenceRequired: keyA.evidenceRequired || keyB.evidenceRequired,
    derivedFrom: [a, b],
    composedOf: candidate.keyPair,
    genesis: genesisMeta(candidate)
  };
}

function isEvidenceValid(evidence) {
  if (!evidence || typeof evidence !== 'object') return false;
  const runs = Number(evidence.runs);
  const gain = Number(evidence.observedGain);
  if (!Number.isFinite(runs) || runs < 3) return false;
  if (!Number.isFinite(gain) || gain <= 0) return false;
  return typeof evidence.context === 'string' && evidence.context.length > 0;
}

/**
 * Étage 3 — admission : la proposition n'entre au registre qu'avec une
 * preuve expérimentale valide (≥ 3 runs, gain > 0, contexte décrit).
 * Fail-closed : sans preuve, pas d'admission, quelle que soit la
 * plausibilité de la proposition.
 */
function admitProposedKey({ proposal, evidence, keys }) {
  if (!proposal || proposal.genesis.stage !== 'proposed') {
    return { admitted: false, reason: 'not_a_proposal' };
  }
  if (!isEvidenceValid(evidence)) {
    return { admitted: false, reason: 'invalid_evidence', requirement: '>=3 runs, observedGain > 0, context required' };
  }
  const registry = keys || COGNITIVE_KEYS;
  const existing = new Set(registry.map((key) => key.id));
  if (existing.has(proposal.id)) {
    return { admitted: false, reason: 'id_already_registered' };
  }
  // L'opération composée n'est PAS dans l'enum — l'admission est un
  // changement de contrat explicite : le schéma doit être étendu au
  // même moment (le test du registre échouera sinon, volontairement).
  const admitted = {
    ...proposal,
    genesis: { ...proposal.genesis, stage: 'admitted', evidence }
  };
  const validation = validateRegistry([...registry, admitted]);
  if (!validation.valid) {
    return { admitted: false, reason: 'registry_validation_failed', errors: validation.errors };
  }
  return { admitted: true, key: admitted };
}

module.exports = {
  findCandidates,
  proposeKey,
  admitProposedKey,
  isEvidenceValid
};
