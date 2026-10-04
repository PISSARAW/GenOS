'use strict';

function createWorkflowRunner(evaluateStep) {
  if (typeof evaluateStep !== 'function') throw new TypeError('evaluateStep must be a function.');
  return async function runVariantWorkflow(db, input = {}) {
    const steps = Array.isArray(input.steps) ? input.steps : [];
    if (!steps.length || steps.length > 32) {
      throw Object.assign(new Error('Workflow must contain between 1 and 32 steps.'), { code: 'HOLOBIONT_WORKFLOW_SIZE_INVALID' });
    }
    const completed = [];
    let revision = input.expectedSessionRevision;
    for (const [index, step] of steps.entries()) {
      if (!step || typeof step !== 'object' || Array.isArray(step) || !step.operation) {
        return { status: 'PARTIAL_FAILED', completed, failedStepId: String(step?.stepId || index),
          sessionRevision: revision, failure: { code: 'HOLOBIONT_WORKFLOW_STEP_INVALID', message: 'Each step requires an operation.' } };
      }
      try {
        const evaluation = await evaluateStep(db, { ...input, ...step, expectedSessionRevision: revision,
          runtimeInput: { ...(step.runtimeInput || {}), signal: input.signal,
            workflowResults: completed.map((item) => item.result) } });
        if (!evaluation?.receipt || !Number.isInteger(evaluation.sessionRevision)) {
          throw Object.assign(new Error('Step evaluator returned no durable receipt or revision.'), { code: 'HOLOBIONT_WORKFLOW_RECEIPT_INVALID' });
        }
        completed.push(evaluation.receipt);
        revision = evaluation.sessionRevision;
      } catch (error) {
        return { status: 'PARTIAL_FAILED', completed, failedStepId: String(step.stepId || index),
          sessionRevision: revision, failure: { code: error.code || 'HOLOBIONT_WORKFLOW_STEP_FAILED', message: error.message } };
      }
    }
    return { status: 'COMPLETED', completed, sessionRevision: revision };
  };
}

module.exports = { createWorkflowRunner };
