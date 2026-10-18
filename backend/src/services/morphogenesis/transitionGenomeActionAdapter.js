'use strict';

const executor = require('./morphogenesisGenomeExecutorService');

function executionInput(action, ctx) {
  return {
    db: ctx.db,
    action: action.genomeAction,
    planId: ctx.plan.id,
    sourceAgentId: ctx.agentId || ctx.parent?.id,
    scope: {
      organizationId: ctx.req?.tenant?.organizationId,
      projectId: ctx.req?.tenant?.projectId
    }
  };
}

async function run(action, ctx) {
  return executor.executeGenomeAction(executionInput(action, ctx));
}

async function compensate(item, ctx, cause) {
  return executor.abandonCandidate({ db: ctx.db, receipt: item.result, cause });
}

module.exports = { compensate, run };
