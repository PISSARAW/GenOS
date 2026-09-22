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

const DEFAULTS_BY_ROLE = Object.freeze({
  core: {
    runtimeAuthority: true,
    falsifiable: true,
    historicalConfidence: 1,
    scope: 'Concept d\'infrastructure GenOS — exécutable, vérifié par tests.',
    knownLimits: ['Ce rôle ne s\'applique qu\'à l\'infrastructure interne de GenOS.'],
  },
  operational: {
    runtimeAuthority: false,
    falsifiable: true,
    historicalConfidence: 0.85,
    scope: 'Concept exposé par un service GenOS exécutable.',
    knownLimits: ['L\'exécution du service ne valide pas la thèse philosophique sous-jacente.'],
  },
  analogy: {
    runtimeAuthority: false,
    falsifiable: false,
    historicalConfidence: 0.9,
    scope: 'Concept utilisé comme analogie structurelle, pas comme mécanisme exécutable.',
    knownLimits: ['L\'analogie est un outil d\'interprétation, pas une preuve de ressemblance.'],
  },
  lens: {
    runtimeAuthority: false,
    falsifiable: false,
    historicalConfidence: 0.9,
    scope: 'Tradition ou cadre philosophique utilisé comme lentille d\'analyse.',
    knownLimits: ['Le cadre est une convention interprétative, pas une vérité établie.'],
  },
  speculative: {
    runtimeAuthority: false,
    falsifiable: true,
    historicalConfidence: 0.5,
    scope: 'Position métaphysique contestée ou hypothèse non vérifiée.',
    knownLimits: ['Position non établie ; débat en cours ou preuve insuffisante.'],
  },
});

/**
 * ROLE_BY_ID — association explicite conceptId → role.
 * Tout concept absent de cette table garde son rôle défini localement ou
 * reste sans rôle (null).
 */
const ROLE_BY_ID = Object.freeze(new Map(roleEntries.map(([id, role]) => [id, role])));

module.exports = { DEFAULTS_BY_ROLE, ROLE_BY_ID };
