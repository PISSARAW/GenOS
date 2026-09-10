#!/usr/bin/env node
// MCP-to-backend bridge. It owns one complete GenOS mission, including the
// authority contract and bounded worker fleet, then returns its telemetry.
const path = require('path');
const { spawn } = require('child_process');
const { getDatabase, closeDatabase } = require('../src/db');
const runtime = require('../src/services/agentRuntimeAdapter');
const contracts = require('../src/services/strategyContractService');
const workerGarage = require('../src/services/workerGarageService');
const aTeamService = require('../src/services/aTeamService');
const trinityService = require('../src/services/trinityService');
const biologicalMode = require('../src/services/biologicalModeService');
const dynamicOrganization = require('../src/services/dynamicOrganizationService');
const telemetry = require('../src/services/telemetryObserver');
const strategyAdaptation = require('../src/services/strategyAdaptationService');
const userProgress = require('../src/services/userProgressService');
const orchestrationCoverage = require('../src/services/orchestrationCoverageService');
const { normalizeAllowedCommands } = require('../src/services/sandboxCommandPolicy');
const { handleAction, handleBackground, initializeMission } = require('./orchestratorActions.cjs');

if (process.env.GENOS_STREAM_TELEMETRY === '1') {
  telemetry.on('telemetry', (evt) => {
    process.stdout.write(`GENOS_STREAM:${JSON.stringify(evt)}\n`);
  });
}

const request = JSON.parse(process.argv[2] || '{}');
const action = request.action || 'orchestrate';
const task = String(request.mission || request.task || 'Autonomous GenOS orchestration');
let orchestratorId = request.orchestratorId;
let id = action === 'dispatch_worker' ? request.workerId : null;
// Accept the policy at the top level (current schema) and inside `arguments`
// while older long-lived MCP clients refresh their cached tool schema.
const policyRequest = request.arguments && typeof request.arguments === 'object' ? request.arguments : request;
const allowedCommands = normalizeAllowedCommands(policyRequest.allowed_commands) || [];
const allowFileEdits = policyRequest.allow_file_edits === true;

// This bridge creates a root authority boundary. A delegated worker must never
// be able to enter it, even if a globally configured/public GenOS MCP endpoint
// accidentally leaks into the worker's Codex process.
const workerSafeActions = new Set(['organization_publish', 'organization_inbox', 'organization_state']);
if (String(process.env.GENOS_EXECUTION_MODE || '').toLowerCase() === 'worker' && !workerSafeActions.has(action)) {
  const owner = process.env.GENOS_ORCHESTRATOR_AGENT_ID || 'its orchestrator';
  throw new Error(`GenOS worker recursion blocked: delegated workers must return evidence to ${owner}, not create another orchestrator.`);
}

async function waitForCompletion(db) {
  const deadline = Date.now() + Number(request.timeoutMs || 14 * 60 * 1000);
  while (Date.now() < deadline) {
    const agents = await db.all('SELECT id, status FROM agents WHERE id = ? OR parent_agent_id = ?', id, id);
    if (agents.length && agents.every((agent) => ['idle', 'blocked', 'error', 'terminated', 'apoptosis', 'completed'].includes(agent.status))) return agents;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('GenOS orchestrator timed out');
}

function tokenUsage(runs) {
  const executionRuns = runs.map((run) => {
    let metrics = {}; try { metrics = JSON.parse(run.metrics_json || '{}'); } catch (_) {}
    return { agentId: run.agent_id, status: run.status, tokens: Number(metrics.tokens || 0) };
  });
  return { executionRuns, totalTokens: executionRuns.reduce((sum, run) => sum + run.tokens, 0), allRunsCompleted: executionRuns.length > 0 && executionRuns.every((run) => run.status === 'completed') };
}

async function prepareRuntime(initDb) {
  await runtime.reconcilePersistedRuntimes(initDb);
  const topLevelMissionActions = new Set(['orchestrate', 'dispatch_team', 'dispatch_trinity', 'dispatch_biological']);
  if (!orchestratorId && !topLevelMissionActions.has(action)) {
    const active = await initDb.get(`SELECT a.id FROM agents a WHERE a.execution_mode = 'orchestrator' AND a.status NOT IN ('completed', 'terminated', 'apoptosis', 'error') AND (a.is_apoptotic = 0 OR a.is_apoptotic IS NULL) ORDER BY a.updated_at DESC, a.created_at DESC LIMIT 1`);
    if (active) orchestratorId = active.id;
  }
  if (!orchestratorId) orchestratorId = `mcp_orchestrator_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  if (!id) id = action === 'dispatch_worker' ? `worker_${orchestratorId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` : orchestratorId;
}

async function executeMission(db, state) {
  await initializeMission({ db, action, orchestratorId, task });
  const actionContext = { db, action, request, task, orchestratorId, id, repoRoot: path.resolve(__dirname, '../..'), bridgePath: __filename, waitForCompletion };
  if (await handleAction(actionContext)) {
    state.delegatedWorkerId = actionContext.delegatedWorkerId || null;
    state.reusedWorker = Boolean(actionContext.reusedWorker);
    return;
  }
  await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, model_tier, isolation_mode, current_task) VALUES (?, 'MCP GenOS Orchestrator', 'Autonomous Orchestrator', 'idle', 'orchestrator', 'frontier', 'Branch', ?)`, id, task);
  await db.run(`UPDATE agents SET status = 'idle', is_apoptotic = 0, current_task = ? WHERE id = ?`, task, id);
  const strategyContract = await contracts.saveContract(db, { agentId: id, problem: task, createdBy: 'mcp_orchestrate' });
  await runtime.startMission({ agentId: id, name: 'MCP GenOS Orchestrator', role: 'Autonomous Orchestrator', prompt: task, modelTier: 'frontier', strategyContract: strategyContract.contract, executionBudget: request.executionBudget || {}, executionPolicy: { allowedCommands, allowFileEdits }, silentUpdates: policyRequest.silent_updates === true, autonomousOrchestration: policyRequest.autonomous_orchestration !== false });
  const agents = await waitForCompletion(db);
  const telemetryRows = await db.all('SELECT event_type, action, detail, severity, payload_json FROM telemetry_events WHERE agent_id = ? OR agent_id IN (SELECT id FROM agents WHERE parent_agent_id = ?) ORDER BY created_at', id, id);
  const runs = await db.all('SELECT agent_id, status, metrics_json FROM strategy_execution_runs WHERE agent_id = ? OR agent_id IN (SELECT id FROM agents WHERE parent_agent_id = ?) ORDER BY created_at', id, id);
  const coverage = await orchestrationCoverage.auditMission(db, id).catch((err) => ({ error: err.message, verdict: 'audit-incomplete' }));
  telemetry.emitEvent({ eventType: 'ORCHESTRATION_AUDIT_COMPLETED', agentId: id, action: 'COVERAGE_AUDIT', detail: `Orchestration coverage verdict: ${coverage.verdict}`, severity: 'info', payload: { observedTools: coverage.protocol?.observedCount || 0, verdict: coverage.verdict } });
  process.stdout.write(JSON.stringify({ orchestratorId: id, agents, telemetry: telemetryRows, token_usage: tokenUsage(runs), coverage }));
}

async function cleanupFailure(db, state, error) {
  if (!state.delegatedWorkerId) return;
  await db.run("UPDATE agents SET status = 'error', current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", error.message, state.delegatedWorkerId).catch(() => {});
  await db.run("UPDATE trinity_worlds SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?", state.delegatedWorkerId).catch(() => {});
}

async function executeForeground(db) {
  const state = {};
  try { await executeMission(db, state); } catch (error) { await cleanupFailure(db, state, error); throw error; }
  finally {
    if (request.detachedProcessId) await db.run('DELETE FROM detached_processes WHERE id = ?', request.detachedProcessId).catch(() => {});
    await closeDatabase();
  }
}

async function main() {
  const initDb = await getDatabase();
  await prepareRuntime(initDb);
  if (request.background === true) {
    await handleBackground({ request, action, task, orchestratorId, id, repoRoot: path.resolve(__dirname, '../..'), bridgePath: __filename, getDatabase, closeDatabase });
    return;
  }
  await executeForeground(await getDatabase());
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
