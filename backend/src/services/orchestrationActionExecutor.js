/** Execute only fully-specified orchestration decisions.  This deliberately
 * refuses to manufacture manifests, scores, or genomes merely to appear autonomous. */
const mcp = require('./mcpExecutor');
const telemetry = require('./telemetryObserver');
const path = require('path');

function actionArguments(decision, event, workspaceRoot) {
  const payload = event.payload || {};
  if (decision.tool === 'genos_replay') {
    return { root: workspaceRoot, ...(payload.snapshot ? { snapshot: payload.snapshot } : {}), ...(payload.branchId ? { branch_id: payload.branchId } : {}) };
  }
  if (decision.tool === 'genos_record_experience' && payload.strategy && payload.outcome) {
    return { root: workspaceRoot, strategy: payload.strategy, context: payload.context || event.detail || 'Autonomous worker event', outcome: payload.outcome, successful: event.eventType === 'AGENT_COMPLETED', evidence: payload.evidence || [event.id], source_branch: payload.branchId };
  }
  if (decision.tool === 'genos_record_experience' && payload.proposal) {
    return { root: workspaceRoot, strategy: 'local_capsule_patch', context: event.detail || 'Local isolated code worker', outcome: `Changed ${(payload.proposal.changedFiles || []).join(', ') || 'no files'}; ${(payload.proposal.tests || []).map((test) => `${test.command}:${test.exitCode}`).join(', ') || 'no tests requested'}`, successful: (payload.proposal.tests || []).every((test) => test.exitCode === 0), evidence: [payload.proposal.proposal?.evidence || 'local capsule proposal', ...(payload.proposal.changedFiles || [])], source_branch: sourceBranch(payload) };
  }
  if (decision.tool === 'genos_evaluate_trajectories' && payload.solveId && Array.isArray(payload.scores) && payload.scores.length) {
    return { root: workspaceRoot, solve_id: payload.solveId, scores: payload.scores };
  }
  if (decision.tool === 'genos_parasitic_pressure' && payload.input && payload.output) {
    const root = path.resolve(workspaceRoot);
    const input = path.resolve(root, payload.input);
    const output = path.resolve(root, payload.output);
    if (input.startsWith(`${root}${path.sep}`) && output.startsWith(`${root}${path.sep}`)) return { input, output, evolve: 'true' };
  }
  return null;
}
function sourceBranch(payload) { return payload.branchId || payload.executionRunId || undefined; }

async function execute({ orchestratorId, sourceAgentId, decision, event, workspaceRoot }) {
  const args = actionArguments(decision, event, workspaceRoot);
  if (!args) {
    telemetry.emitEvent({ eventType: 'ORCHESTRATION_ACTION_DEFERRED', agentId: orchestratorId, action: decision.action, detail: 'Decision retained until its required evidence is available.', severity: 'info', payload: { sourceAgentId, tool: decision.tool, reason: decision.reason, eventId: event.id } });
    return { executed: false, deferred: true, reason: 'missing_required_evidence' };
  }
  const result = await mcp.executeConfiguredTransport({ toolName: decision.tool, args, timeoutMs: 30000 });
  telemetry.emitEvent({ eventType: result.success ? 'ORCHESTRATION_ACTION_EXECUTED' : 'ORCHESTRATION_ACTION_FAILED', agentId: orchestratorId, action: decision.action, detail: result.success ? `Executed ${decision.tool}.` : `Could not execute ${decision.tool}: ${result.error || result.status}`, severity: result.success ? 'info' : 'warning', payload: { sourceAgentId, tool: decision.tool, args, result, eventId: event.id } });
  if (result.success && decision.tool === 'genos_record_experience') {
    const memoryArgs = { root: workspaceRoot, facts: [`${args.strategy}: ${args.outcome}`], decisions: [decision.reason], failures: args.successful ? [] : [args.outcome], constraints: ['Capsule changes are never merged automatically.'], source_refs: args.evidence || [] };
    const memory = await mcp.executeConfiguredTransport({ toolName: 'genos_compile_memory', args: memoryArgs, timeoutMs: 30000 });
    telemetry.emitEvent({ eventType: memory.success ? 'ORCHESTRATION_MEMORY_COMPILED' : 'ORCHESTRATION_MEMORY_DEFERRED', agentId: orchestratorId, action: 'compile_memory', detail: memory.success ? 'Compiled evidence-backed worker memory.' : 'Experience was recorded but memory compilation could not run.', severity: memory.success ? 'info' : 'warning', payload: { result: memory } });
  }
  return { executed: result.success, result };
}

module.exports = { actionArguments, execute };
