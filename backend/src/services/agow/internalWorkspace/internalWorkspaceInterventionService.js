'use strict';

const adapter = require('./internalWorkspaceAdapter');

async function intervene(options) {
  validateInterventionCapability(options);
  const result = await options.interveneModel({ modelId: options.modelId, probeId: options.probeId,
    layerRange: options.layerRange, intervention: options.intervention, input: options.input });
  return assessResult(result);
}

function validateInterventionCapability(options) {
  adapter.requireActivations(options);
  if (options.modelCapabilities.activationIntervention !== true || typeof options.interveneModel !== 'function') {
    throw new TypeError('Causal activation intervention capability is unavailable.');
  }
}

function assessResult(result) {
  if (!validInterventionResult(result)) throw new TypeError('J-space intervention outcome requires behavior measures and evidence.');
  const delta = distance(result.behaviorBefore, result.behaviorAfter);
  const controlled = result.design === 'randomized_controlled' && Array.isArray(result.controlDeltas)
    && result.controlDeltas.length >= 2;
  return { interventionId: result.interventionId || null, behaviorDelta: delta,
    causalStatus: causalStatus(controlled, delta),
    evidenceRefs: result.evidenceRefs, promotionAllowed: false };
}

function validInterventionResult(result) {
  return Boolean(result && result.interventionApplied === true && Array.isArray(result.behaviorBefore)
    && Array.isArray(result.behaviorAfter) && Array.isArray(result.evidenceRefs) && result.evidenceRefs.length);
}

function causalStatus(controlled, delta) {
  if (delta === 0) return 'no_behavior_change';
  return controlled ? 'causally_supported' : 'intervention_effect_observed_uncontrolled';
}

function distance(before, after) {
  if (before.length !== after.length || !before.length
    || [...before, ...after].some((value) => !Number.isFinite(value))) throw new TypeError('J-space behavior vectors must align.');
  return Math.sqrt(before.reduce((sum, value, index) => sum + ((after[index] - value) ** 2), 0));
}

module.exports = { intervene, assessResult, distance, validateInterventionCapability };
