'use strict';

async function execute(input) {
  const receipts = [];
  for (const step of input.plan.steps) {
    const result = await performStep(input, step, receipts);
    receipts.push({ step, result, completedAt: new Date().toISOString() });
    if (input.onStepComplete) await input.onStepComplete({ step, result });
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
    throw blocked(step, error.code || error.message);
  }
}

function assertResult(step, result) {
  if (result === undefined || result === null) throw blocked(step, 'RESULT_MISSING');
  if (result.status === 'BLOCKED' || result.status === 'FAILED') throw blocked(step, result.reason || result.status);
  return result;
}

function blocked(step, reason) {
  return Object.assign(new Error(`Biocenose runtime stopped at '${step}': ${reason}.`), {
    code: 'BIOCENOSE_RUNTIME_STEP_BLOCKED', details: { step, reason }
  });
}

module.exports = { execute };
