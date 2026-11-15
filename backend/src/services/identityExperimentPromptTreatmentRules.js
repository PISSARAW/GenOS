'use strict';

function applyIdentityExperimentTreatment(context) {
  return { selfIntro: context.input.selfIntro || '', conscienceBlock: context.input.conscienceBlock || '', workerSelfBlock: context.input.workerSelfBlock || '' };
}

module.exports = { applyIdentityExperimentTreatment };
