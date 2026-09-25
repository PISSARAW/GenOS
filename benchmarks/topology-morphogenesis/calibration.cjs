'use strict';

function brierScore(predictions) {
  if (!Array.isArray(predictions) || predictions.length === 0) throw new Error('Observed outcomes are required for calibration.');
  let squaredError = 0;
  for (const prediction of predictions) {
    if (!Number.isFinite(prediction.confidence) || prediction.confidence < 0 || prediction.confidence > 1) {
      throw new Error('Confidence must be a measured value in [0, 1].');
    }
    if (typeof prediction.outcome !== 'boolean') throw new Error('Each prediction requires an externally observed boolean outcome.');
    const outcome = prediction.outcome ? 1 : 0;
    squaredError += (prediction.confidence - outcome) ** 2;
  }
  return { count: predictions.length, score: squaredError / predictions.length };
}

module.exports = { brierScore };
