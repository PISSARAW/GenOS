'use strict';

const { clamp } = require('./securityPerceptionPrimitives');

function calibrate(state, classification, confidence) {
  const prior = state.calibration[classification] || { samples: 0, confirmed: 0 };
  const samples = prior.samples + 1;
  const calibrated = samples < 5 ? clamp(confidence) : clamp((prior.confirmed + 1) / (samples + 2));
  return { calibrated, samples, abstain: classification === 'indeterminate' || samples < 5 && confidence < 0.5 };
}

function recordOutcome(state, classification, correct) {
  const prior = state.calibration[classification] || { samples: 0, confirmed: 0 };
  state.calibration[classification] = { samples: prior.samples + 1, confirmed: prior.confirmed + (correct ? 1 : 0) };
  return state.calibration[classification];
}

module.exports = { calibrate, recordOutcome };
