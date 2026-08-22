#!/usr/bin/env node
/*
 * Runs the actual backend orchestrator against one isolated fixture. This is
 * intentionally separate from run.mjs: invoking it spends model tokens.
 */
const fs = require('fs');
const path = require('path');

const [fixtureDir, reportPath] = process.argv.slice(2);
if (!fixtureDir || !reportPath) {
  throw new Error('Usage: node run-orchestrator.cjs <fixture-dir> <report-path>');
}

const repoRoot = path.resolve(__dirname, '../..');
const dbPath = path.join(path.dirname(reportPath), 'orchestrator.db');
process.env.GENOS_WORKSPACE_ROOT = path.resolve(fixtureDir);
process.env.GENOS_DB_PATH = dbPath;
process.env.GENOS_AGENT_EXECUTOR = path.join(repoRoot, 'backend/bin/genos-agent-runtime.cjs');

const { getDatabase, closeDatabase } = require('../../backend/src/db');
const runtime = require('../../backend/src/services/agentRuntimeAdapter');
const contracts = require('../../backend/src/services/strategyContractService');

const id = `benchmark_orchestrator_${Date.now()}`;
const prompt = `Résous la tâche dans TASK.md dans ce workspace isolé. Tu peux modifier uniquement src/lib.rs et exécuter les tests. Implémente une solution complète, robuste aux zéros et aux grands intermédiaires, avec la contrainte asymptotique demandée. N'édite ni les tests ni Cargo.toml.`;

async function waitForCompletion(db, timeoutMs = 15 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const agents = await db.all('SELECT id, name, status, parent_agent_id, current_task FROM agents WHERE id = ? OR parent_agent_id = ?', id, id);
    const terminal = agents.length > 0 && agents.every((agent) => ['idle', 'error', 'terminated', 'apoptosis'].includes(agent.status));
    if (terminal) return agents;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('orchestrator benchmark timed out');
}

async function main() {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  const startedAt = Date.now();
  try {
    await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, model_tier, isolation_mode, current_task)
      VALUES (?, 'Benchmark Orchestrator', 'Autonomous Orchestrator', 'idle', 'orchestrator', 'frontier', 'Branch', ?)`, id, prompt);
    const strategyContract = await contracts.saveContract(db, {
      agentId: id,
      problem: `${prompt} The task is an expert algorithmic implementation with uncertain optimization details.`,
      createdBy: 'expert-dp-orchestrator-benchmark'
    });
    await runtime.startMission({
      agentId: id, name: 'Benchmark Orchestrator', role: 'Autonomous Orchestrator', prompt,
      modelTier: 'frontier', workspaceIsolation: 'Branch', strategyContract: strategyContract.contract,
      executionBudget: { tokens: 60000, minimumWorkerTokens: 8000, costUsd: 10, latencyMs: 14 * 60 * 1000 }
    });
    const agents = await waitForCompletion(db);
    const telemetry = await db.all('SELECT event_type, action, detail, payload_json, severity, created_at FROM telemetry_events WHERE agent_id = ? OR agent_id IN (SELECT id FROM agents WHERE parent_agent_id = ?) ORDER BY created_at', id, id);
    const runs = await db.all('SELECT agent_id, status, budget_json, metrics_json, guardrail_reason FROM strategy_execution_runs WHERE agent_id = ? OR agent_id IN (SELECT id FROM agents WHERE parent_agent_id = ?)', id, id);
    fs.writeFileSync(reportPath, `${JSON.stringify({
      schema_version: 1, condition: 'genos_orchestrator', started_at: new Date(startedAt).toISOString(),
      duration_ms: Date.now() - startedAt, orchestrator_id: id, agents, telemetry, runs
    }, null, 2)}\n`);
  } finally {
    await closeDatabase();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
