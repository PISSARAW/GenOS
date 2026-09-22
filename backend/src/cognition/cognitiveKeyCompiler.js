'use strict';

/**
 * Cognitive Key System — compilateur concept → clé (ADR 0033, point 8).
 *
 * Compilation PROGRESSIVE des concepts : un concept peut déclarer des
 * `cognitiveKeys` (schéma philosophical-concept étendu). Le compilateur :
 *  1. collecte les clés déclarées dans le registre de concepts ;
 *  2. ajoute `derivedFrom: [<id du concept>]` (la provenance est
 *     structurelle, jamais réécrite à la main) ;
 *  3. valide chaque clé compilée contre le contrat CognitiveKey complet
 *     (y compris la règle d'indépendance doctrinale et l'enum fermé
 *     des opérations) ;
 *  4. fusionne dans le registre : les clés du catalogue manuel
 *     (cognitiveKeyDefinitions) restent la base, les clés compilées
 *     s'ajoutent si leur ID n'existe pas déjà (le catalogue manuel a
 *     priorité — une clé compilée ne peut pas écraser une clé validée).
 *
 * Ce compilateur est DÉCLARATIF : il ne fait pas d'extraction sémantique
 * (impossible sans LLM et contraire au point 2 du plan — l'extraction
 * manuelle reste la voie validée). Il rend les 354 concepts COMPILABLES
 * : chaque concept peut être enrichi d'une clé quand la communauté en
 * extrait une, sans toucher au code.
 *
 * Les opérations des clés compilées doivent appartenir à l'enum du
 * contrat — étendre le vocabulaire reste un changement de contrat
 * explicite (pas d'opération inconnue silencieusement acceptée).
 */

const { COGNITIVE_KEYS } = require('./cognitiveKeyDefinitions');
const { normalizeKey, validateRegistry } = require('./cognitiveKeyRegistry');

function conceptsWithKeys(concepts) {
  return (concepts || []).filter((concept) => Array.isArray(concept.cognitiveKeys) && concept.cognitiveKeys.length > 0);
}

function compileConceptKey(concept, declaredKey) {
  return {
    ...declaredKey,
    derivedFrom: [concept.id]
  };
}

function compiledKeys(concepts) {
  return conceptsWithKeys(concepts).flatMap((concept) => concept.cognitiveKeys.map((declaredKey) => compileConceptKey(concept, declaredKey)));
}

/**
 * Compile et fusionne.
 * @returns {{valid, keys, compiledCount, errors, warnings}}
 */
function compileFromConcepts(concepts) {
  const compiled = compiledKeys(concepts);
  const existingIds = new Set(COGNITIVE_KEYS.map((key) => key.id));
  const fresh = compiled.filter((key) => !existingIds.has(key.id));
  const skipped = compiled.length - fresh.length;

  const merged = [...COGNITIVE_KEYS, ...fresh];
  const registry = validateRegistry(merged);
  return {
    valid: registry.valid,
    keys: registry.keys,
    compiledCount: fresh.length,
    skippedDuplicates: skipped,
    errors: registry.errors,
    warnings: skipped > 0 ? [`${skipped} declared key(s) skipped: id already in the manual catalogue`] : []
  };
}

module.exports = {
  compileFromConcepts,
  compiledKeys,
  conceptsWithKeys,
  normalizeKey
};
