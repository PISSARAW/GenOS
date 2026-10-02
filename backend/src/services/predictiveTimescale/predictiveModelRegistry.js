'use strict';

const models = Object.freeze({
  deterministic: require('./models/deterministicPredictor'),
  bayesian_gaussian: require('./models/bayesianGaussianPredictor'),
  learned_local: require('./models/learnedLocalPredictor'),
  external_model: require('./models/externalPredictor')
});

function resolve(modelId) {
  const model = models[modelId];
  if (!model) throw new TypeError(`Unknown predictive model: ${modelId}`);
  return model;
}

function list() { return Object.keys(models); }

module.exports = { resolve, list };
