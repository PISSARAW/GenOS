'use strict';

const { detectAutoimmunity } = require('./autoimmuneDetector');

function assessImmuneOverreaction(input = {}) {
  const detection = detectAutoimmunity(input);
  return {
    reviewRequired: detection.suspected,
    recommendedAction: detection.suspected ? 'REVIEW_IMMUNE_POLICY' : 'CONTINUE_MONITORING',
    suspects: detection.suspects,
    calibration: detection.calibration,
    bypassAllowed: false,
    automaticGateChange: false
  };
}

module.exports = { assessImmuneOverreaction };
