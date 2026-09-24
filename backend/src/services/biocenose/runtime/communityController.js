'use strict';

const planner = require('./deliberationPlanner');
const executor = require('./deliberationExecutor');

async function runRound(input) {
  if (!input.session || input.session.status !== 'ACTIVE') {
    throw Object.assign(new Error('Biocenose runtime requires an active community.'), { code: 'BIOCENOSE_RUNTIME_SESSION_INVALID' });
  }
  const plan = planner.planRound({ round: input.session.round, constitution: input.constitution });
  if (plan.status !== 'PLANNED') return { ...plan, status: 'BLOCKED' };
  const result = await executor.execute({
    plan, handlers: input.handlers || {}, context: input.context || {}, onStepComplete: input.onStepComplete
  });
  const finalStep = result.receipts[result.receipts.length - 1]?.result;
  const status = finalStep?.finalized === false ? 'IN_PROGRESS' : result.status;
  return { ...result, status, communityId: input.session.communityId, plan };
}

module.exports = { runRound };
