'use strict';

function pullStep1(context) {
if (!context.agentId || context.req.body?.sections) return { value: ( { success: false, error: 'A target agent and full-state pull are required.' }) };
}

function pullStep2(context) {
if (!context.tracked?.object_id || context.objectId !== context.tracked.object_id) {
    return { value: ( { success: false, error: 'Pull requires the current tracked remote tip.' }) };
  }
}

module.exports = { pullStep1, pullStep2 };
