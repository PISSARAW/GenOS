'use strict';

function pull(context) {
  return !context.object || context.object.agent_id !== context.agentId || context.verifySource(context.object).length;
}

module.exports = { pull };
