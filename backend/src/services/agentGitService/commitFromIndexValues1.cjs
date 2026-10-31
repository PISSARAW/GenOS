'use strict';

function commitFromIndexValue1(__genosValueScope1) {
  return (__genosValueScope1.ref?.object_id || null) !== __genosValueScope1.data.baseObjectId || (0, __genosValueScope1.Number)(__genosValueScope1.ref?.version || 0) !== __genosValueScope1.data.baseRefVersion;
}

function commitFromIndexValue2(__genosValueScope2) {
  return __genosValueScope2.options.refName || __genosValueScope2.req.body?.refName || 'main';
}

function commitFromIndexValue3(__genosValueScope3) {
  return __genosValueScope3.data.baseObjectId && (!__genosValueScope3.parent || __genosValueScope3.parent.agent_id !== __genosValueScope3.agentId);
}

module.exports = { commitFromIndexValue1, commitFromIndexValue2, commitFromIndexValue3 };
