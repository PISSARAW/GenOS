'use strict';

function bisectReplayRule1(context) {
  return !context.good || !context.bad || context.good.agent_id !== context.bad.agent_id || context.good.workspace_id !== context.bad.workspace_id;
}

function bisectReplayRule2(context) {
  return !context.path || context.path.length < 2 || context.path.length > 64 || !context.path.some((item) => item.id === context.goodObjectId);
}

function bisectReplayRule3(context) {
  return !context.goodObjectId || !context.badObjectId || !context.probeName;
}

module.exports = { bisectReplayRule1, bisectReplayRule2, bisectReplayRule3 };
