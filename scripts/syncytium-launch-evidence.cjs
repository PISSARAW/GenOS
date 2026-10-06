'use strict';

function classifyOutput(output) {
  const mode = output?.biologicalMode;
  return mode?.complete === true && mode.status === 'completed'
    && mode.semanticValidation?.status === 'complete'
    && mode.stateValidation?.status === 'verified' ? 'completed' : 'partial';
}

module.exports = { classifyOutput };
