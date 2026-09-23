'use strict';

const counterfactualPlanner = require('./counterfactualPlanner');

module.exports = {
  ...counterfactualPlanner,
  default: counterfactualPlanner,
};
