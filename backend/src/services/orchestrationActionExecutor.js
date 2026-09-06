/** Execute only fully-specified orchestration decisions.  This deliberately
 * refuses to manufacture manifests, scores, or genomes merely to appear autonomous. */
const mcp = require('./mcpExecutor');
const telemetry = require('./telemetryObserver');
const path = require('path');
const { getDatabase } = require('../db');

function actionArguments(decision, event, workspaceRoot) {
  const payload = event.payload || {};
  if (decision.tool === 'genos_replay') {
    // A replay without an event source is not evidence. Keep the decision
    // visible but defer it until the worker returns a concrete branch or
    // snapshot rather than issuing a guaranteed-failing CLI call.
    if (!payload.snapshot && !payload.branchId) return null;
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
  const sourceEventId = String(event.id || '').trim();
  let db = null;
  if (sourceEventId && decision.tool) {
    db = await getDatabase();
    const receiptKey = `${orchestratorId}:${sourceEventId}:${decision.tool}`;
    const receipt = await db.run(
      `INSERT OR IGNORE INTO orchestration_action_receipts
        (receipt_key, orchestrator_id, source_event_id, tool, status)
       VALUES (?, ?, ?, ?, 'started')`,
      receiptKey, orchestratorId, sourceEventId, decision.tool
    );
    if (receipt.changes !== 1) {
      telemetry.emitEvent({ eventType: 'ORCHESTRATION_ACTION_DEDUPLICATED', agentId: orchestratorId, action: decision.action, detail: 'Duplicate orchestration action suppressed.', severity: 'info', payload: { sourceAgentId, tool: decision.tool, eventId: sourceEventId } });
      return { executed: false, duplicate: true };
    }
  }
  const args = actionArguments(decision, event, workspaceRoot);
  if (!args) {
    telemetry.emitEvent({ eventType: 'ORCHESTRATION_ACTION_DEFERRED', agentId: orchestratorId, action: decision.action, detail: 'Decision retained until its required evidence is available.', severity: 'info', payload: { sourceAgentId, tool: decision.tool, reason: decision.reason, eventId: event.id } });
    if (db && sourceEventId) await db.run("UPDATE orchestration_action_receipts SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE orchestrator_id = ? AND source_event_id = ? AND tool = ?", orchestratorId, sourceEventId, decision.tool);
    return { executed: false, deferred: true, reason: 'missing_required_evidence' };
  }
  const result = await mcp.execute({ agentId: orchestratorId, toolName: decision.tool, args });
  if (db && sourceEventId) await db.run("UPDATE orchestration_action_receipts SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE orchestrator_id = ? AND source_event_id = ? AND tool = ?", result.success ? 'completed' : 'failed', orchestratorId, sourceEventId, decision.tool);
  telemetry.emitEvent({ eventType: result.success ? 'ORCHESTRATION_ACTION_EXECUTED' : 'ORCHESTRATION_ACTION_FAILED', agentId: orchestratorId, action: decision.action, detail: result.success ? `Executed ${decision.tool}.` : `Could not execute ${decision.tool}: ${result.error || result.status}`, severity: result.success ? 'info' : 'warning', payload: { sourceAgentId, tool: decision.tool, args, result, eventId: event.id } });
  if (result.success && decision.tool === 'genos_record_experience') {
    const memoryArgs = { root: workspaceRoot, facts: [`${args.strategy}: ${args.outcome}`], decisions: [decision.reason], failures: args.successful ? [] : [args.outcome], constraints: ['Capsule changes are never merged automatically.'], source_refs: args.evidence || [] };
    const memory = await mcp.execute({ agentId: orchestratorId, toolName: 'genos_compile_memory', args: memoryArgs });
    telemetry.emitEvent({ eventType: memory.success ? 'ORCHESTRATION_MEMORY_COMPILED' : 'ORCHESTRATION_MEMORY_DEFERRED', agentId: orchestratorId, action: 'compile_memory', detail: memory.success ? 'Compiled evidence-backed worker memory.' : 'Experience was recorded but memory compilation could not run.', severity: memory.success ? 'info' : 'warning', payload: { result: memory } });
  }
  return { executed: result.success, result };
}

module.exports = { actionArguments, execute };
