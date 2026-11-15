'use strict';

function commitFromIndexRule1(context) {
  return (context.ref?.object_id || null) !== context.data.baseObjectId || context.Number(context.ref?.version || 0) !== context.data.baseRefVersion;
}

function commitFromIndexRule2(context) {
  return context.options.refName || context.req.body?.refName || 'main';
}

function commitFromIndexRule3(context) {
  return context.data.baseObjectId && (!context.parent || context.parent.agent_id !== context.agentId);
}

module.exports = { commitFromIndexRule1, commitFromIndexRule2, commitFromIndexRule3 };
