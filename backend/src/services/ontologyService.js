'use strict';

/**
 * Ontology Service — Être, Substance, Attribut, Mode.
 *
 * Mapping GenOS :
 *  - Substance  = agent (entité fondamentale)
 *  - Attribut   = propriété mutable (status, budget, role)
 *  - Mode       = configuration d'exécution (localRuntime, isolationMode)
 *  - Essence    = définition intrinsèque (role, purpose)
 *  - Hypostatisation = création d'un worker spécialisé à partir d'un attribut
 */

const ontologies = new Map();

/**
 * Crée la description ontologique d'un agent.
 * @param {string} agentId
 * @param {object} [substance]
 * @returns {object} being
 */
function defineBeing(agentId, substance = {}) {
  if (!agentId || typeof agentId !== 'string') {
    throw new Error('ontologyService.defineBeing requires a valid agentId');
  }
  const being = {
    id: agentId,
    substance: substance.type || 'agent',
    attributes: new Map(),
    modes: new Map(),
    essence: substance.essence || null,
    createdAt: Date.now(),
  };
  ontologies.set(agentId, being);
  return being;
}

/**
 * Enregistre un attribut d'une substance.
 * @param {string} agentId
 * @param {string} key
 * @param {*} value
 * @returns {object} attribute
 */
function setAttribute(agentId, key, value) {
  const being = ontologies.get(agentId) || defineBeing(agentId);
  if (!key || typeof key !== 'string') {
    throw new Error('ontologyService.setAttribute requires a valid key');
  }
  const attribute = {
    key,
    value,
    previousValue: being.attributes.get(key)?.value ?? null,
    updatedAt: Date.now(),
    provenance: 'ontological',
  };
  being.attributes.set(key, attribute);
  return attribute;
}

/**
 * Définit un mode d'exécution pour un agent.
 * Nécessaire, possible ou impossible.
 * @param {string} agentId
 * @param {string} mode
 * @param {'necessary'|'possible'|'impossible'} constraint
 */
function defineMode(agentId, mode, constraint = 'possible') {
  const being = ontologies.get(agentId) || defineBeing(agentId);
  if (!mode || typeof mode !== 'string') {
    throw new Error('ontologyService.defineMode requires a valid mode');
  }
  const validConstraints = new Set(['necessary', 'possible', 'impossible']);
  if (!validConstraints.has(constraint)) {
    throw new Error(`ontologyService.defineMode invalid constraint: ${constraint}`);
  }
  being.modes.set(mode, { mode, constraint, active: false, definedAt: Date.now() });
  return being.modes.get(mode);
}

/**
 * Hypostatisation : transforme un attribut en entité autonome (worker, capsule).
 * @param {string} agentId
 * @param {string} attributeKey
 * @param {string} [targetId]
 * @returns {object} hypostasis
 */
function hypostatize(agentId, attributeKey, targetId = null) {
  const being = ontologies.get(agentId);
  if (!being) throw new Error(`ontologyService.hypostatize: being ${agentId} not found`);
  const attribute = being.attributes.get(attributeKey);
  if (!attribute) {
    throw new Error(`ontologyService.hypostatize: attribute ${attributeKey} not found on ${agentId}`);
  }
  return {
    id: targetId || `${agentId}_${attributeKey}_hypostasis`,
    type: 'hypostasis',
    source: agentId,
    essence: attribute.value,
    createdAt: Date.now(),
  };
}

/**
 * Récupère l'ontologie d'un agent.
 * @param {string} agentId
 * @returns {object|undefined}
 */
function getOntology(agentId) {
  return ontologies.get(agentId);
}

/**
 * Retourne toutes les substances connues.
 * @returns {object[]}
 */
function listBeings() {
  return Array.from(ontologies.values()).map(being => ({
    id: being.id,
    substance: being.substance,
    attributeCount: being.attributes.size,
    modeCount: being.modes.size,
    essence: being.essence,
  }));
}

module.exports = {
  defineBeing,
  setAttribute,
  defineMode,
  hypostatize,
  getOntology,
  listBeings,
};
