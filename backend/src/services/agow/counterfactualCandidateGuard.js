'use strict';

function isCounterfactual(candidate) {
  return candidate?.epistemicOrigin?.realityMode === 'counterfactual';
}

function mayWriteCanonicalWorld(candidate) {
  return !isCounterfactual(candidate);
}

function rejectReason(candidate) {
  return isCounterfactual(candidate) ? 'counterfactual_write_isolated' : null;
}

module.exports = { isCounterfactual, mayWriteCanonicalWorld, rejectReason };
