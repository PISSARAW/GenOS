'use strict';

/**
 * Substance Service — Main Entry Point
 * Re-exports all substance modules.
 */

const core = require('./substanceCore');
const monad = require('./substanceMonad');
const cartesian = require('./substanceCartesian');
const conatus = require('./substanceConatus');

module.exports = {
  // Core (Aristotle, Spinoza)
  createPrimarySubstance: core.createPrimarySubstance,
  createSecondarySubstance: core.createSecondarySubstance,
  ensureInfiniteSubstance: core.ensureInfiniteSubstance,
  registerAsFiniteMode: core.registerAsFiniteMode,
  getSubstanceHierarchy: core.getSubstanceHierarchy,
  checkSubstanceIdentity: core.checkSubstanceIdentity,
  checkSubstancePersistence: core.checkSubstancePersistence,
  hashContent: core.hashContent,

  // Monad (Leibniz)
  createMonad: monad.createMonad,
  getMonadData: monad.getMonadData,
  updateMonadPerception: monad.updateMonadPerception,
  getAllMonads: monad.getAllMonads,

  // Cartesian (Descartes)
  createCartesianPair: cartesian.createCartesianPair,
  getCartesianUnion: cartesian.getCartesianUnion,
  evaluateCogitansActivity: cartesian.evaluateCogitansActivity,
  evaluateExtensaProperties: cartesian.evaluateExtensaProperties,

  // Conatus (Spinoza)
  evaluateConatus: conatus.evaluateConatus,
  getConatusState: conatus.getConatusState,
  triggerConatusResponse: conatus.triggerConatusResponse,

  // Constants
  SPINOZA_ATTRIBUTES: core.SPINOZA_ATTRIBUTES,
  LEIBNIZ_PERFECTIONS: monad.LEIBNIZ_PERFECTIONS
};