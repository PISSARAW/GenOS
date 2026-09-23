'use strict';

/**
 * @deprecated Use backend/src/services/counterfactual/interventions.js
 */

const interventions = require('../../counterfactual/interventions');

module.exports = {
  COUNTERFACTUAL_TYPES: interventions.COUNTERFACTUAL_TYPES,
  generateIntervention: interventions.generateIntervention,
  calculateBlastRadius: interventions.calculateBlastRadius,
};
