'use strict';

function applySemanticValidation(output, validation, expectedCount) {
  output.semanticValidation = validation;
  output.complete = validation.status === 'complete'
    && validation.workerCount === expectedCount
    && validation.coveredWorkers === expectedCount
    && output.members.length === expectedCount
    && output.members.every((member) => member.status === 'completed')
    && !(output.dispatchFailures || []).length;
  if (!output.complete) output.semanticValidation.status = 'incomplete';
  output.status = output.complete ? 'completed' : 'partial';
  return output;
}

module.exports = { applySemanticValidation };
