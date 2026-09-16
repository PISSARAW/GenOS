'use strict';

/**
 * Ontology Service — Main Entry Point
 * Re-exports all ontology modules for backward compatibility.
 */

const core = require('./ontologyCore');
const attributes = require('./ontologyAttributes');
const modes = require('./ontologyModes');
const mereology = require('./ontologyMereology');
const hypostatization = require('./ontologyHypostatization');
const identity = require('./ontologyIdentity');

// Re-export all functions
module.exports = {
  // Core
  defineBeing: core.defineBeing,
  getBeing: core.getBeing,
  ensureBeingExists: core.ensureBeingExists,
  listBeings: core.listBeings,
  ceaseBeing: core.ceaseBeing,
  hashEssence: core.hashEssence,

  // Attributes
  setAttribute: attributes.setAttribute,
  getAttributes: attributes.getAttributes,
  getAttribute: attributes.getAttribute,
  getAttributeHistory: attributes.getAttributeHistory,
  serializeValue: attributes.serializeValue,
  deserializeValue: attributes.deserializeValue,

  // Modes
  defineMode: modes.defineMode,
  activateMode: modes.activateMode,
  deactivateMode: modes.deactivateMode,
  failMode: modes.failMode,
  getMode: modes.getMode,
  getModes: modes.getModes,
  getActiveModes: modes.getActiveModes,

  // Mereology
  addMereology: mereology.addMereology,
  detachMereology: mereology.detachMereology,
  getParts: mereology.getParts,
  getWholes: mereology.getWholes,
  getEssentialParts: mereology.getEssentialParts,
  getConstitutiveParts: mereology.getConstitutiveParts,

  // Hypostatization
  hypostatize: hypostatization.hypostatize,
  reabsorbHypostasis: hypostatization.reabsorbHypostasis,
  getActiveHypostatizations: hypostatization.getActiveHypostatizations,
  getHypostatizationHistory: hypostatization.getHypostatizationHistory,

  // Identity
  recordIdentityEvent: identity.recordIdentityEvent,
  checkIdentityContinuity: identity.checkIdentityContinuity,
  getIdentityHistory: identity.getIdentityHistory,
  recordEssentialChange: identity.recordEssentialChange,
  recordAccidentalChange: identity.recordAccidentalChange,
  recordPartReplacement: identity.recordPartReplacement,
  recordMemoryConsolidation: identity.recordMemoryConsolidation,
  recordCessation: identity.recordCessation,

  // Constants
  SUBSTANCE_TYPES: core.SUBSTANCE_TYPES,
  ATTRIBUTE_MODALITIES: attributes.ATTRIBUTE_MODALITIES,
  MODE_CONSTRAINTS: modes.MODE_CONSTRAINTS,
  MODE_STATES: modes.MODE_STATES,
  MEREOLOGY_TYPES: mereology.MEREOLOGY_TYPES,
  HYPOSTASIS_TYPES: hypostatization.HYPOSTASIS_TYPES,
  IDENTITY_EVENT_TYPES: identity.IDENTITY_EVENT_TYPES
};