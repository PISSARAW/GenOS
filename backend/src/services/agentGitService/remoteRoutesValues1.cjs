'use strict';

function pullValue1(__genosValueScope1) {
  return !__genosValueScope1.object || __genosValueScope1.object.agent_id !== __genosValueScope1.agentId || (0, __genosValueScope1.verifySource)(__genosValueScope1.object).length;
}

module.exports = { pullValue1 };
