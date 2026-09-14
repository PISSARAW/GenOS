const mcp = require('./mcpExecutor');
const telemetry = require('./telemetryObserver');
const path = require('path');
const { getDatabase } = require('../db');
const ACTION_RECEIPT_LEASE_MS = 5 * 60 * 1000;

function actionArguments(decision, event, workspaceRoot) {
  const payload = event.payload || {};
  const context = { decision, event, payload, workspaceRoot };
  if (decision.tool === 'genos_replay') return replayArguments(context);
  if (decision.tool === 'genos_record_experience') return experienceArguments(context);
  if (decision.tool === 'genos_evaluate_trajectories') return trajectoryArguments(context);
  if (decision.tool === 'genos_parasitic_pressure') return parasiticArguments(context);
  if (decision.tool === 'genos_snapshot') return snapshotArguments(context);
  return null;
}

function replayArguments(context) {
  const payload = context.payload;
  if (!payload.snapshot) return null;
  return { root: context.workspaceRoot, snapshot: payload.snapshot };
}

function experienceArguments(context) {
  const payload = context.payload;
  if (payload.strategy && payload.outcome) return strategyExperience(context);
  if (payload.proposal) return proposalExperience(context);
  return null;
}

function strategyExperience(context) {
  const event = context.event;
  const payload = context.payload;
  return { root: context.workspaceRoot, strategy: payload.strategy, context: payload.context || event.detail || 'Autonomous worker event', outcome: payload.outcome, successful: event.eventType === 'AGENT_COMPLETED', evidence: payload.evidence || [event.id], source_branch: payload.branchId };
}

function proposalExperience(context) {
  const event = context.event;
  const payload = context.payload;
  const proposal = payload.proposal;
  return { root: context.workspaceRoot, strategy: 'local_capsule_patch', context: event.detail || 'Local isolated code worker', outcome: `Changed ${(proposal.changedFiles || []).join(', ') || 'no files'}; ${(proposal.tests || []).map((test) => `${test.command}:${test.exitCode}`).join(', ') || 'no tests requested'}`, successful: (proposal.tests || []).every((test) => test.exitCode === 0), evidence: [proposalEvidence(proposal.proposal) || 'local capsule proposal', ...(proposal.changedFiles || [])], source_branch: sourceBranch(payload) };
}

function proposalEvidence(proposal) {
  if (!proposal) return undefined;
  return proposal.evidence;
}

function trajectoryArguments(context) {
  const payload = context.payload;
  if (!payload.solveId) return null;
  if (!Array.isArray(payload.scores)) return null;
  if (!payload.scores.length) return null;
  return { root: context.workspaceRoot, solve_id: payload.solveId, scores: payload.scores };
}

function parasiticArguments(context) {
  const payload = context.payload;
  if (!payload.input || !payload.output) return null;
  const root = path.resolve(context.workspaceRoot);
  const input = path.resolve(root, payload.input);
  const output = path.resolve(root, payload.output);
  if (!input.startsWith(`${root}${path.sep}`)) return null;
  if (!output.startsWith(`${root}${path.sep}`)) return null;
  return { input, output, evolve: 'true' };
}

function snapshotArguments(context) {
  const decision = context.decision;
  const payload = context.payload;
  if (decision.action !== 'quarantine_and_fork') return null;
  const root = path.resolve(context.workspaceRoot);
  const agent = path.resolve(root, payload.agent || 'agent.json');
  const out = path.resolve(root, payload.out || `snapshot_quarantine_${Date.now()}.json`);
  return { agent, out };
}

function sourceBranch(payload) { return payload.branchId || payload.executionRunId || undefined; }

async function execute({ orchestratorId, sourceAgentId, decision, event, workspaceRoot }) {
  const sourceEventId = String(event.id || '').trim();
  const context = { orchestratorId, sourceAgentId, decision, event, workspaceRoot, sourceEventId, db: null };
  if (await claimReceipt(context)) {
    emitDeduplicated(context);
    return { executed: false, duplicate: true };
  }
  const args = actionArguments(decision, event, workspaceRoot);
  if (!args) return deferAction(context);
  return runAction(context, args);
}

async function claimReceipt(context) {
  const orchestratorId = context.orchestratorId;
  const sourceEventId = context.sourceEventId;
  const decision = context.decision;
  if (!sourceEventId || !decision.tool) return false;
  context.db = await getDatabase();
  const receiptKey = `${orchestratorId}:${sourceEventId}:${decision.tool}`;
  const existing = await context.db.get(
    'SELECT status, completed_at, created_at FROM orchestration_action_receipts WHERE orchestrator_id = ? AND source_event_id = ? AND tool = ?',
    orchestratorId, sourceEventId, decision.tool
  );
  if (suppressesDuplicate(existing)) return true;
  const receipt = existing
    ? await context.db.run(
      `UPDATE orchestration_action_receipts SET status = 'started', completed_at = NULL WHERE orchestrator_id = ? AND source_event_id = ? AND tool = ?`,
      orchestratorId, sourceEventId, decision.tool
    )
    : await context.db.run(
      `INSERT OR IGNORE INTO orchestration_action_receipts
        (receipt_key, orchestrator_id, source_event_id, tool, status)
       VALUES (?, ?, ?, ?, 'started')`,
      receiptKey, orchestratorId, sourceEventId, decision.tool
    );
  if (receipt.changes !== 1 && !existing) return true;
  return false;
}

function suppressesDuplicate(existing) {
  if (!existing) return false;
  if (isDeferredReceipt(existing)) return false;
  return !isStaleReceipt(existing);
}

function isDeferredReceipt(existing) {
  return existing.status === 'failed' && !existing.completed_at;
}

function isStaleReceipt(existing) {
  if (existing.status !== 'started') return false;
  if (!existing.created_at) return false;
  const startedAt = Date.parse(`${existing.created_at}Z`);
  return Number.isFinite(startedAt) && Date.now() - startedAt >= ACTION_RECEIPT_LEASE_MS;
}

function emitDeduplicated(context) {
  telemetry.emitEvent({ eventType: 'ORCHESTRATION_ACTION_DEDUPLICATED', agentId: context.orchestratorId, action: context.decision.action, detail: 'Duplicate orchestration action suppressed.', severity: 'info', payload: { sourceAgentId: context.sourceAgentId, tool: context.decision.tool, eventId: context.sourceEventId } });
}

async function deferAction(context) {
  telemetry.emitEvent({ eventType: 'ORCHESTRATION_ACTION_DEFERRED', agentId: context.orchestratorId, action: context.decision.action, detail: 'Decision retained until its required evidence is available.', severity: 'info', payload: { sourceAgentId: context.sourceAgentId, tool: context.decision.tool, reason: context.decision.reason, eventId: context.event.id } });
  if (context.db && context.sourceEventId) await context.db.run(`UPDATE orchestration_action_receipts SET status = 'failed', completed_at = NULL WHERE orchestrator_id = ? AND source_event_id = ? AND tool = ?`, context.orchestratorId, context.sourceEventId, context.decision.tool);
  return { executed: false, deferred: true, reason: 'missing_required_evidence' };
}

async function runAction(context, args) {
  const result = await mcp.execute({ agentId: context.orchestratorId, toolName: context.decision.tool, args });
  if (context.db && context.sourceEventId) await context.db.run(`UPDATE orchestration_action_receipts SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE orchestrator_id = ? AND source_event_id = ? AND tool = ?`, result.success ? 'completed' : 'failed', context.orchestratorId, context.sourceEventId, context.decision.tool);
  emitExecution(context, args, result);
  if (result.success && context.decision.tool === 'genos_record_experience') await compileMemory(context, args);
  await require('./swarmTopologyRuntimeService').applyStepForOrchestrator(context.orchestratorId, { db: context.db || undefined }).catch(() => {});
  return { executed: result.success, result };
}

function emitExecution(context, args, result) {
  const success = result.success;
  const detail = success ? `Executed ${context.decision.tool}.` : `Could not execute ${context.decision.tool}: ${result.error || result.status}`;
  telemetry.emitEvent({ eventType: success ? 'ORCHESTRATION_ACTION_EXECUTED' : 'ORCHESTRATION_ACTION_FAILED', agentId: context.orchestratorId, action: context.decision.action, detail, severity: success ? 'info' : 'warning', payload: { sourceAgentId: context.sourceAgentId, tool: context.decision.tool, args, result, eventId: context.event.id } });
}

async function compileMemory(context, args) {
  const memoryArgs = { root: context.workspaceRoot, facts: [`${args.strategy}: ${args.outcome}`], decisions: [context.decision.reason], failures: args.successful ? [] : [args.outcome], constraints: ['Capsule changes are never merged automatically.'], source_refs: args.evidence || [] };
  const memory = await mcp.execute({ agentId: context.orchestratorId, toolName: 'genos_compile_memory', args: memoryArgs });
  telemetry.emitEvent({ eventType: memory.success ? 'ORCHESTRATION_MEMORY_COMPILED' : 'ORCHESTRATION_MEMORY_DEFERRED', agentId: context.orchestratorId, action: 'compile_memory', detail: memory.success ? 'Compiled evidence-backed worker memory.' : 'Experience was recorded but memory compilation could not run.', severity: memory.success ? 'info' : 'warning', payload: { result: memory } });
}

module.exports = { actionArguments, execute };
