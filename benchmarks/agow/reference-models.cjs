'use strict';

const timescales = require('../../backend/src/services/predictiveTimescale/predictiveTimescaleService');
const twin = require('../../backend/src/services/selfTwin/selfTwinService');
const links = require('../../backend/src/services/selfTwin/selfTwinEdgeLearningService');

const CONDITIONS = ['mbh_style', 'lipson_style', 'genos_timescales',
  'self_twin_timescales', 'self_twin_controlled_links', 'precision_learning_ablated'];

function create(condition) {
  const calibrated = { levels: Object.fromEntries(['T0', 'T3'].map((level) => [level,
    { values: { actuator_gain: { posterior: 1 } } }])) };
  return { condition, fast: 1, slow: 1, gain: 1, integral: 0,
    timescales: timescales.ensureState(calibrated), edge: null, errors: [], observations: [] };
}

function command(state, target) {
  const gain = Math.max(0.1, state.gain);
  const correction = state.condition === 'mbh_style' ? 0.1 * state.integral : 0;
  return Math.max(0, Math.min(2, (target + correction) / gain));
}

function updateTimescales(state, observation) {
  const input = { metric: 'actuator_gain', prediction: state.gain,
    observation: observation.observedGain, evidenceRefs: [observation.ref],
    independentRefs: [observation.ref], tolerance: 0.1 };
  if (state.condition === 'precision_learning_ablated') input.precision = 1;
  const fast = timescales.updateLevel(state.timescales, { ...input, timescale: 'T0' });
  const slow = timescales.updateLevel(state.timescales, { ...input, timescale: 'T3' });
  const discrepancy = twin.compare({ predictionId: observation.ref }, [{
    metric: 'actuator_gain', predicted: state.gain, observed: observation.observedGain }]);
  const weight = state.condition === 'self_twin_timescales' ? Math.min(0.95, 0.5 + discrepancy.epsilon) : 0.5;
  state.gain = weight * fast.next.posterior + (1 - weight) * slow.next.posterior;
  state.observations.push({ ...input, discrepancy, fast: fast.next, slow: slow.next });
}

function updateLinks(state, observation) {
  state.edge = links.updateEdge(state.edge, { source: 'actuator', target: 'position', relation: 'gain',
    effect: observation.probeOutput, controlEffect: observation.controlOutput,
    design: 'randomized_controlled', isolationVerified: true, evidenceRefs: [observation.ref],
    context: { interventionOrder: observation.interventionOrder } });
  state.gain = state.edge.effectDistribution.mean / observation.probeCommand;
  state.observations.push({ ref: observation.ref, edge: state.edge });
}

function observe(state, observation) {
  state.errors.push(Math.abs(observation.target - observation.output));
  state.integral = Math.max(-1, Math.min(1, state.integral + observation.target - observation.output));
  if (state.condition === 'self_twin_controlled_links') return updateLinks(state, observation);
  if (state.condition === 'mbh_style') {
    state.fast += 0.4 * (observation.observedGain - state.fast);
    state.slow += 0.08 * (observation.observedGain - state.slow);
    state.gain = 0.7 * state.fast + 0.3 * state.slow;
  } else if (state.condition === 'lipson_style') {
    state.gain += 0.5 * (observation.observedGain - state.gain);
  } else updateTimescales(state, observation);
}

module.exports = { CONDITIONS, create, command, observe };
