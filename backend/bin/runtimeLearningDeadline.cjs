'use strict';
const deadline = require('../src/services/optionalLearningDeadline');
async function run({ ctx, operation, timeoutMs = 5000 }) {
  const result = await deadline.run({ operation, timeoutMs });
  if (!result.completed) ctx.emit({
    eventType: 'RUNTIME_LEARNING_DEFERRED', action: 'LEARNING_DEADLINE',
    detail: result.reason, severity: 'warning', payload: { agentId: ctx.mission.agentId, timeoutMs }
  });
  return result;
}
module.exports = { run };
