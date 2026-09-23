'use strict';

/**
 * @deprecated Use backend/src/services/counterfactual/experiments.js
 */

const experiments = require('../../counterfactual/experiments');

module.exports = {
  buildProbes: experiments.buildProbes,
  executeVfsExperiment: experiments.executeVfsExperiment,
  EXPERIMENT_STATUS: require('../../counterfactual/counterfactualPlanner').EXPERIMENT_STATUS,
  runExperiment: experiments.executeVfsExperiment,
};
