'use strict';

function workflowError(message, code) {
  return Object.assign(new Error(message), { code });
}

function validSteps(input) {
  const steps = Array.isArray(input.steps) ? input.steps : [];
  if (!steps.length || steps.length > 32) throw workflowError('Workflow must contain between 1 and 32 steps.', 'HOLOBIONT_WORKFLOW_SIZE_INVALID');
  return steps;
}

function stepInput(input, step, state) {
  if (!step || typeof step !== 'object' || Array.isArray(step) || !step.operation) {
    throw workflowError('Each step requires an operation.', 'HOLOBIONT_WORKFLOW_STEP_INVALID');
  }
  if (step.holobiontId && step.holobiontId !== input.holobiontId) {
    throw workflowError('Workflow step cannot change its Host.', 'HOLOBIONT_WORKFLOW_SCOPE_INVALID');
  }
  return { ...input, ...step, holobiontId: input.holobiontId,
    actorId: input.actorId, signal: input.signal, expectedSessionRevision: state.revision,
    verifyEvaluationEvidence: input.verifyEvaluationEvidence,
    runtimeInput: { ...(step.runtimeInput || {}), signal: input.signal,
      workflowResults: state.completed.map((item) => item.result) } };
}

function appendEvaluation(state, evaluation) {
  if (!evaluation?.receipt || !Number.isInteger(evaluation.sessionRevision)) {
    throw workflowError('Step evaluator returned no durable receipt or revision.', 'HOLOBIONT_WORKFLOW_RECEIPT_INVALID');
  }
  state.completed.push(evaluation.receipt);
  state.revision = evaluation.sessionRevision;
}

function failureResult(context, error) {
  const { state, step, index } = context;
  return { status: 'PARTIAL_FAILED', completed: state.completed, failedStepId: String(step?.stepId || index),
    sessionRevision: state.revision, failure: { code: error.code || 'HOLOBIONT_WORKFLOW_STEP_FAILED', message: error.message } };
}

function createWorkflowRunner(evaluateStep) {
  if (typeof evaluateStep !== 'function') throw new TypeError('evaluateStep must be a function.');
  return async function runVariantWorkflow(db, input = {}) {
    const steps = validSteps(input);
    const state = { completed: [], revision: input.expectedSessionRevision };
    for (const [index, step] of steps.entries()) {
      try {
        input.signal?.throwIfAborted();
        const evaluation = await evaluateStep(db, stepInput(input, step, state));
        input.signal?.throwIfAborted();
        appendEvaluation(state, evaluation);
      } catch (error) {
        return failureResult({ state, step, index }, error);
      }
    }
    return { status: 'COMPLETED', completed: state.completed, sessionRevision: state.revision };
  };
}

module.exports = { createWorkflowRunner };
