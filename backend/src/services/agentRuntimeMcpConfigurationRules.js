'use strict';

function applyWorkerDatabasePolicy(context) {
  return context.state?.executionMode === 'worker'
    || context.Boolean(context.agentId && context.orchestratorId && context.agentId !== context.orchestratorId) || context.isCapsuleWorker;
}

module.exports = { applyWorkerDatabasePolicy };
