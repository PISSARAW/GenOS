'use strict';
const mcp = require('./mcpExecutor');
const telemetry = require('./telemetryObserver');
const deadline = require('./optionalLearningDeadline');
const { verifiedResult } = require('./orchestrationActionResult');
async function compile(context, args) {
  const memoryArgs = { agentId: context.orchestratorId, facts: [args.strategy + ': ' + args.outcome],
    decisions: [context.decision.reason], failures: args.successful ? [] : [args.outcome],
    constraints: ['Capsule changes are never merged automatically.'], source_refs: args.evidence || [] };
  const attempt = await deadline.run({
    operation: () => mcp.execute({ agentId: context.orchestratorId, toolName: 'genos_compile_memory', args: memoryArgs }),
    timeoutMs: context.memoryTimeoutMs || 5000
  });
  const result = attempt.completed ? verifiedResult({ decision: { tool: 'genos_compile_memory' } }, {}, attempt.value) : null;
  const success = result?.success === true;
  telemetry.emitEvent({
    eventType: success ? 'ORCHESTRATION_MEMORY_COMPILED' : 'ORCHESTRATION_MEMORY_DEFERRED',
    agentId: context.orchestratorId, action: 'compile_memory', severity: success ? 'info' : 'warning',
    detail: success ? 'Compiled evidence-backed worker memory.' : (attempt.reason || 'Experience was recorded but memory compilation could not run.'),
    payload: { result: attempt.value, eventId: context.sourceEventId, reason: attempt.reason }
  });
  return { completed: success };
}
module.exports = { compile };
