'use strict';
const { authoritySchema } = require('./biologyDatabase');
const { digest } = require('../../src/services/biologicalIntegrity');

async function workerSchema(db) {
  await authoritySchema(db);
  await db.exec(`ALTER TABLE missions ADD COLUMN orchestrator_agent_id TEXT;
    ALTER TABLE missions ADD COLUMN created_at TEXT;
    ALTER TABLE missions ADD COLUMN updated_at TEXT;
    CREATE TABLE agents (id TEXT PRIMARY KEY, execution_mode TEXT, parent_agent_id TEXT,
    organization_id TEXT, project_id TEXT, metadata_json TEXT, role TEXT, dna_json TEXT, workspace_id TEXT);
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    INSERT INTO workspaces VALUES ('worker-workspace', 'org', 'project');
    CREATE TABLE mission_agents (mission_id TEXT, agent_id TEXT);
    CREATE TABLE strategy_contracts (id TEXT PRIMARY KEY, agent_id TEXT, version INTEGER, contract_json TEXT, contract_hash TEXT);
    CREATE TABLE strategy_execution_runs (id TEXT PRIMARY KEY, agent_id TEXT, contract_id TEXT, contract_version INTEGER,
      status TEXT, budget_json TEXT, metrics_json TEXT, guardrail_reason TEXT, started_at TEXT, completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE strategy_execution_steps (id TEXT PRIMARY KEY, run_id TEXT, sequence INTEGER, stage_key TEXT,
      strategy_ids_json TEXT, planned_budget_json TEXT, actual_metrics_json TEXT, evidence_json TEXT,
      status TEXT DEFAULT 'planned', started_at TEXT, completed_at TEXT);
    INSERT INTO missions (mission_id, objective, status, orchestrator_agent_id)
      VALUES ('worker-mission', 'Compute subset sum with evidence', 'active', 'parent');
    INSERT INTO agents (id, execution_mode, organization_id, project_id, workspace_id) VALUES ('parent', 'orchestrator', 'org', 'project', 'worker-workspace');`);
}

async function addWorker(db, input = {}) {
  const agentId = input.agentId || 'worker';
  const metadata = { workerContract: { mission: { methodContract: {
    methodId: 'subset_sum', parameters: { values: [2, 3, 7], target: 5 }
  } } } };
  await db.run(`INSERT INTO agents (id, execution_mode, parent_agent_id, organization_id, project_id, metadata_json, role, workspace_id)
    VALUES (?, 'worker', 'parent', 'org', 'project', ?, 'procedural_executor', 'worker-workspace')`, agentId, JSON.stringify(metadata));
  await db.run('INSERT INTO mission_agents VALUES (?, ?)', 'worker-mission', agentId);
  const contract = { execution_pipeline: [], strategy_portfolio: [], promotion: input.promotion || {} };
  const id = `contract-${agentId}`;
  await db.run('INSERT INTO strategy_contracts VALUES (?, ?, 1, ?, ?)', id, agentId, JSON.stringify(contract), `sha256:${digest(contract)}`);
  return { id, version: 1, contract };
}

function completion(runId, options = {}) {
  return { id: options.id || `complete-${runId}`, eventType: options.eventType || 'AGENT_COMPLETED',
    timestamp: new Date().toISOString(), payload: { executionRunId: runId,
      evidenceReport: options.report || { outcome: 'success', claims: [{ statement: 'Checked result', evidence: ['test://result'] }] },
      usage: options.usage || { total_tokens: 3, cost_usd: 0.01 } } };
}

module.exports = { workerSchema, addWorker, completion };
