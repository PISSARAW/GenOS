'use strict';

const {
  SPECIALIST_CATALOG,
  SPECIALIST_ORDER,
  getSpecialistSpec,
  listSpecialistSpecs,
} = require('./specialistCatalog');

const {
  instantiateSpecialistPhysiology,
  instantiateAllSpecialists,
  assertActionAllowedForSpecialist,
  verifyDeclaredCapabilities,
} = require('./specialistContractService');

const {
  verifySpecialistOutput,
} = require('./specialistOutputVerifier');

const {
  buildSecuritySpecialistRoster,
  verifyResponsibilityBoundaries,
  buildCollaborationHandoff,
  runCollaborativeSecurityReview,
} = require('./specialistCollaborationService');

module.exports = {
  SPECIALIST_CATALOG,
  SPECIALIST_ORDER,
  getSpecialistSpec,
  listSpecialistSpecs,
  getSpecialistDefinition: getSpecialistSpec,
  listSpecialistDefinitions: listSpecialistSpecs,
  instantiateSpecialistPhysiology,
  instantiateAllSpecialists,
  assertActionAllowedForSpecialist,
  verifyDeclaredCapabilities,
  verifySpecialistOutput,
  buildSecuritySpecialistRoster,
  verifyResponsibilityBoundaries,
  buildCollaborationHandoff,
  runCollaborativeSecurityReview,
};
