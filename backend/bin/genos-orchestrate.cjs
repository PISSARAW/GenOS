#!/usr/bin/env node
// MCP-to-backend bridge. It owns one complete GenOS mission, including the
// authority contract and bounded worker fleet, then returns its telemetry.
const path = require('path');
const { spawn } = require('child_process');
const { getDatabase, closeDatabase } = require('../src/db');
const runtime = require('../src/services/agentRuntimeAdapter');
const contracts = require('../src/services/strategyContractService');

const request = JSON.parse(process.argv[2] || '{}');
const task = String(request.task || 'Autonomous GenOS orchestration');
const id = request.orchestratorId || `mcp_orchestrator_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

async function waitForCompletion(db) {
  const deadline = Date.now() + Number(request.timeoutMs || 14 * 60 * 1000);
  while (Date.now() < deadline) {
    const agents = await db.all('SELECT id, status FROM agents WHERE id = ? OR parent_agent_id = ?', id, id);
    if (agents.length && agents.every((agent) => ['idle', 'error', 'terminated', 'apoptosis'].includes(agent.status))) return agents;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('GenOS orchestrator timed out');
}

async function main() {
  // MCP tool calls are request/response interactions. Do not hold the response
  // open for the whole mission: return the durable agent ID immediately and
  // let a detached runner own its lifecycle and final telemetry.
  if (request.background === true) {
    const runner = spawn(process.execPath, [__filename, JSON.stringify({ ...request, background: false, orchestratorId: id })], {
      cwd: path.resolve(__dirname, '../..'),
      detached: true,
      stdio: 'ignore'
    });
    runner.unref();
    process.stdout.write(JSON.stringify({
      orchestratorId: id,
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      task
    }));
    return;
  }

  const db = await getDatabase();
  try {
    await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, model_tier, isolation_mode, current_task)
      VALUES (?, 'MCP GenOS Orchestrator', 'Autonomous Orchestrator', 'idle', 'orchestrator', 'frontier', 'Branch', ?)`, id, task);
    const strategyContract = await contracts.saveContract(db, { agentId: id, problem: task, createdBy: 'mcp_orchestrate' });
    await runtime.startMission({ agentId: id, name: 'MCP GenOS Orchestrator', role: 'Autonomous Orchestrator', prompt: task,
      modelTier: 'frontier', strategyContract: strategyContract.contract, executionBudget: request.executionBudget || {} });
    const agents = await waitForCompletion(db);
    const telemetry = await db.all('SELECT event_type, action, detail, severity FROM telemetry_events WHERE agent_id = ? OR agent_id IN (SELECT id FROM agents WHERE parent_agent_id = ?) ORDER BY created_at', id, id);
    process.stdout.write(JSON.stringify({ orchestratorId: id, agents, telemetry }));
  } finally { await closeDatabase(); }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
