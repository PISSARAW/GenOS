'use strict';

/**
 * Cognitive Key System — catalogue complet (ADR 0033, points 1-2).
 *
 * Une CognitiveKey est une opération mentale extraite d'un concept
 * philosophique : ni une identité, ni une croyance. L'agent consomme
 * l'instruction opérationnelle ; la provenance doctrinale vit dans
 * `derivedFrom` et n'est jamais injectée dans les prompts.
 *
 * Règle d'indépendance doctrinale : chaque `instruction` doit être
 * utilisable sans mentionner le philosophe, l'école ou le mouvement
 * d'origine (vérifiée par cognitiveKeyRegistry.js).
 *
 * Organisation : un fichier par famille cognitive (gate 400 lignes).
 *  - epistemology  : extraction, hypothèses, causes (7 clés)
 *  - structure     : relations, catégories, cadrage (7 clés)
 *  - logic         : frontières, autoréférence, limites (6 clés)
 *  - interpretation: intention, jeu, variation, exaptation (11 clés)
 *  - perspective   : points de vue, éthique, réconciliation (11 clés)
 * Total : 42 clés couvrant les 8 familles du plan.
 */

const { EPISTEMOLOGY_KEYS } = require('./cognitiveKeyEpistemology');
const { STRUCTURE_KEYS } = require('./cognitiveKeyStructure');
const { LOGIC_KEYS } = require('./cognitiveKeyLogic');
const { INTERPRETATION_KEYS } = require('./cognitiveKeyInterpretation');
const { PERSPECTIVE_KEYS } = require('./cognitiveKeyPerspective');

// La famille est une métadonnée d'organisation du catalogue, ajoutée à
// l'agrégation (pas dans les fichiers famille) : elle sert de troisième
// axe à la distance cognitive du portfolio (ADR 0033, point 5).
const withFamily = (family, keys) => keys.map((key) => ({ ...key, family }));

const COGNITIVE_KEYS = [
  ...withFamily('epistemology', EPISTEMOLOGY_KEYS),
  ...withFamily('structure', STRUCTURE_KEYS),
  ...withFamily('logic', LOGIC_KEYS),
  ...withFamily('interpretation', INTERPRETATION_KEYS),
  ...withFamily('perspective', PERSPECTIVE_KEYS)
];

module.exports = { COGNITIVE_KEYS };
