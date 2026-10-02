'use strict';

async function predict(input) {
  if (typeof input.context?.externalPredict !== 'function') {
    throw new TypeError('External predictive model adapter is required.');
  }
  const prediction = await input.context.externalPredict({ state: input.state,
    context: safeContext(input.context), timescale: input.timescale });
  if (!prediction || typeof prediction.mean !== 'object' || typeof prediction.covariance !== 'object') {
    throw new TypeError('External predictive model returned an invalid distribution.');
  }
  return { ...prediction, modelId: 'external_model', evidenceRefs: prediction.evidenceRefs || [] };
}

function safeContext(context) {
  const { externalPredict, ...rest } = context;
  return rest;
}

module.exports = { predict };
