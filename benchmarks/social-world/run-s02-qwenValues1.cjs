'use strict';

function mainValue1(__genosValueScope1) {
  return __genosValueScope1.JSON.stringify((0, __genosValueScope1.canonical)(__genosValueScope1.observed)) === __genosValueScope1.JSON.stringify((0, __genosValueScope1.canonical)(__genosValueScope1.expected))
      && !__genosValueScope1.observed.some((edge) => edge.sourceAgentId === 'agent-a' || edge.targetAgentId === 'agent-a')
      && __genosValueScope1.friend.relationType === 'friend'
      && __genosValueScope1.after.changes.removed === 1;
}

module.exports = { mainValue1 };
