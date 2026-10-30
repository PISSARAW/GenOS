'use strict';

function applyWorkerDatabasePolicyValue1(__genosValueScope1) {
  return __genosValueScope1.state?.executionMode === 'worker'
    || (0, __genosValueScope1.Boolean)(__genosValueScope1.agentId && __genosValueScope1.orchestratorId && __genosValueScope1.agentId !== __genosValueScope1.orchestratorId) || __genosValueScope1.isCapsuleWorker;
}

module.exports = { applyWorkerDatabasePolicyValue1 };
