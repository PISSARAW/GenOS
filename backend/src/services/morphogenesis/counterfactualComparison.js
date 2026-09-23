'use strict';

/**
 * @deprecated Use backend/src/services/counterfactual/comparison.js
 */

const comparison = require('../../counterfactual/comparison');
const promotion = require('../../counterfactual/promotion');

module.exports = {
  compareEffects: comparison.compareEffects,
  computeNormalizedEffect: comparison.computeNormalizedEffect,
  getWorldMetrics: comparison.getWorldMetrics,
  createResult: comparison.createResult,
  promoteWinner: promotion.promoteWinner,
  mapToTopology: promotion.mapToTopology,
};
