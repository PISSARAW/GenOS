'use strict';

function bisectReplayValue1(__genosValueScope1) {
  return !__genosValueScope1.good || !__genosValueScope1.bad || __genosValueScope1.good.agent_id !== __genosValueScope1.bad.agent_id || __genosValueScope1.good.workspace_id !== __genosValueScope1.bad.workspace_id;
}

function bisectReplayValue2(__genosValueScope2) {
  return !__genosValueScope2.path || __genosValueScope2.path.length < 2 || __genosValueScope2.path.length > 64 || !__genosValueScope2.path.some((item) => item.id === __genosValueScope2.goodObjectId);
}

function bisectReplayValue3(__genosValueScope3) {
  return !__genosValueScope3.goodObjectId || !__genosValueScope3.badObjectId || !__genosValueScope3.probeName;
}

module.exports = { bisectReplayValue1, bisectReplayValue2, bisectReplayValue3 };
