'use strict';

function extract(options) {
  requireActivations(options);
  if (typeof options.extractor !== 'function') throw new TypeError('Inspectable activation extractor required.');
  return normalize(awaitExtraction(options));
}

function awaitExtraction(options) {
  const output = options.extractor({ modelId: options.modelId, input: options.input,
    layerRange: options.layerRange, probeId: options.probeId });
  if (output && typeof output.then === 'function') throw new TypeError('Use extractAsync for asynchronous activation extractors.');
  return output;
}

async function extractAsync(options) {
  requireActivations(options);
  if (typeof options.extractor !== 'function') throw new TypeError('Inspectable activation extractor required.');
  return normalize(await options.extractor({ modelId: options.modelId, input: options.input,
    layerRange: options.layerRange, probeId: options.probeId }));
}

function normalize(output) {
  if (!validOutput(output)) throw new TypeError('Internal workspace extraction requires activations, probe and evidence.');
  const activations = output.activations.filter(Number.isFinite);
  if (!activations.length) throw new TypeError('Internal activation vector must be numeric.');
  return { probeId: output.probeId, layerRange: output.layerRange || null, activations,
    evidenceRefs: output.evidenceRefs, extractionMethod: output.extractionMethod || 'unspecified',
    modelId: output.modelId || null };
}

function validOutput(output) {
  return Boolean(output && Array.isArray(output.activations) && output.activations.length
    && output.probeId && Array.isArray(output.evidenceRefs) && output.evidenceRefs.length);
}

function requireActivations(options) {
  if (!options?.modelCapabilities || options.modelCapabilities.internalActivations !== true) {
    throw new TypeError('Model does not expose inspectable internal activations.');
  }
  if (!options.modelId || !options.probeId || !options.layerRange) throw new TypeError('Internal workspace probe identity required.');
}

module.exports = { extract, extractAsync, normalize, requireActivations, validOutput };
