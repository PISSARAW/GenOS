'use strict';

/**
 * conceptRoles.js — mapping déclaratif rôle → concepts et valeurs par défaut.
 *
 * Ce module complète les définitions de conceptDefinitions.js sans les modifier.
 * Il assigne chaque concept à un rôle (core | operational | analogy | lens | speculative)
 * et définit les valeurs par défaut associées (runtimeAuthority, falsifiable,
 * historicalConfidence, scope, knownLimits).
 *
 * Les concepts qui ont déjà un rôle explicite dans leur définition (ex. les 7
 * concepts `core.*` de coreDefinitions.js) sont prioritaires sur ce mapping.
 */

const roleEntries = require('./conceptRoles.data.json');

const CLASSIFICATION_LEVELS = Object.freeze(['reference_only', 'primitive', 'integrated', 'validated']);

const CLASSIFICATION_DEFAULTS = Object.freeze({
  reference_only: {
    description: 'Notion philosophique, biologique ou analogique ; aucune implémentation logicielle.',
    executable: false,
    evidence: 'documentation',
    knownLimits: ['Vocabulaire documentaire uniquement ; ne devient pas une fonctionnalité autonome.'],
  },
  primitive: {
    description: 'Mécanisme logiciel local testé, non appelé par un chemin runtime réel.',
    executable: true,
    evidence: 'crate_tests',
    knownLimits: ['Testé en isolation ; pas de reçu durable ni d\'appel par chemin mission.'],
  },
  integrated: {
    description: 'Mécanisme appelé par un chemin runtime réel (CLI, backend, MCP, orchestrateur) avec lease et permissions.',
    executable: true,
    evidence: 'runtime_tests',
    knownLimits: ['Appelé par runtime ; preuve E2E reproductible manquante.'],
  },
  validated: {
    description: 'Résultat confirmé par une preuve E2E reproductible (commande, seed, artefacts conservés).',
    executable: true,
    evidence: 'e2e_benchmark',
    knownLimits: ['Déploiement production non garanti ; preuves archivées et reproductibles.'],
  },
});

function classificationForRole(role) {
  const map = {
    core: 'validated',
    operational: 'integrated',
    analogy: 'reference_only',
    lens: 'reference_only',
    speculative: 'reference_only',
  };
  return map[role] || 'reference_only';
}

const DEFAULTS_BY_ROLE = Object.freeze({
  core: {
    runtimeAuthority: true,
    falsifiable: true,
    historicalConfidence: 1,
    scope: 'Concept d\'infrastructure GenOS — exécutable, vérifié par tests.',
    knownLimits: ['Ce rôle ne s\'applique qu\'à l\'infrastructure interne de GenOS.'],
    classification: 'validated',
  },
  operational: {
    runtimeAuthority: false,
    falsifiable: true,
    historicalConfidence: 0.85,
    scope: 'Concept exposé par un service GenOS exécutable.',
    knownLimits: ['L\'exécution du service ne valide pas la thèse philosophique sous-jacente.'],
    classification: 'integrated',
  },
  analogy: {
    runtimeAuthority: false,
    falsifiable: false,
    historicalConfidence: 0.9,
    scope: 'Concept utilisé comme analogie structurelle, pas comme mécanisme exécutable.',
    knownLimits: ['L\'analogie est un outil d\'interprétation, pas une preuve de ressemblance.'],
    classification: 'reference_only',
  },
  lens: {
    runtimeAuthority: false,
    falsifiable: false,
    historicalConfidence: 0.9,
    scope: 'Tradition ou cadre philosophique utilisé comme lentille d\'analyse.',
    knownLimits: ['Le cadre est une convention interprétative, pas une vérité établie.'],
    classification: 'reference_only',
  },
  speculative: {
    runtimeAuthority: false,
    falsifiable: true,
    historicalConfidence: 0.5,
    scope: 'Position métaphysique contestée ou hypothèse non vérifiée.',
    knownLimits: ['Position non établie ; débat en cours ou preuve insuffisante.'],
    classification: 'reference_only',
  },
});

/**
 * ROLE_BY_ID — association explicite conceptId → role.
 * Tout concept absent de cette table garde son rôle défini localement ou
 * reste sans rôle (null).
 */
const ROLE_BY_ID = Object.freeze(new Map(roleEntries.map(([id, role]) => [id, role])));

module.exports = { DEFAULTS_BY_ROLE, ROLE_BY_ID, CLASSIFICATION_LEVELS, CLASSIFICATION_DEFAULTS, classificationForRole };
