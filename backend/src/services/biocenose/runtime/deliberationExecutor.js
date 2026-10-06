'use strict';

const { withTransaction } = require('../../../db');

async function execute(input) {
  const receipts = [...(input.receipts || [])];
  for (const step of input.plan.steps.slice(receipts.length)) {
    const executeStep = async () => {
      const result = await performStep(input, step, receipts);
      if (input.onStepComplete) await input.onStepComplete({ step, result });
      return result;
    };
    const result = input.context.db ? await withTransaction(input.context.db, executeStep) : await executeStep();
    receipts.push({ step, result, completedAt: new Date().toISOString() });
  }
  return { status: 'COMPLETED', round: input.plan.round, receipts };
}

async function performStep(input, step, receipts) {
  const handler = input.handlers[step];
  if (typeof handler !== 'function') throw blocked(step, 'HANDLER_MISSING');
  try {
    const result = await handler({ ...input.context, step, priorResults: receipts.map((item) => item.result) });
    return assertResult(step, result);
  } catch (error) {
    if (error.code === 'BIOCENOSE_RUNTIME_STEP_BLOCKED') throw error;
    throw blocked(step, error.code || error.message, {
      validationErrors: error.validationErrors || error.details?.validationErrors
    });
  }
}

function assertResult(step, result) {
  if (result === undefined || result === null) throw blocked(step, 'RESULT_MISSING');
  if (result.status === 'BLOCKED' || result.status === 'FAILED') throw blocked(step, result.reason || result.status);
  return result;
}

function blocked(step, reason, details = {}) {
  return Object.assign(new Error(`Biocenose runtime stopped at '${step}': ${reason}.`), {
    code: 'BIOCENOSE_RUNTIME_STEP_BLOCKED', details: {
      step, reason,
      ...(Array.isArray(details.validationErrors) ? { validationErrors: details.validationErrors } : {})
    }
  });
}

module.exports = { execute };
