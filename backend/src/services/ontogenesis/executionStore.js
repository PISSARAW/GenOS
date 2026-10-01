'use strict';

const { migrateOntogenesisExecution } = require('../../db/migrations/migrateOntogenesisExecution');
const { migrateOntogenesisLedger } = require('../../db/migrations/migrateOntogenesisLedger');
const { withTransaction } = require('../../db');

async function ensureTables(db) {
  await migrateOntogenesisExecution(db);
  await migrateOntogenesisLedger(db);
}

async function activeExecution(db, projectId) {
  return db.get("SELECT * FROM ontogenesis_execution WHERE project_id = ? AND phase IN ('prepared','running','finished','verified')", [projectId]);
}

async function createExecution(db, input) {
  await db.run(`INSERT INTO ontogenesis_execution
    (id, project_id, task_id, worktree, base_sha, topology, variant, reservation_mb, budgets_json, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [input.id, input.projectId, input.taskId, input.worktree, input.baseSha, input.topology,
    input.variant, input.reservationMb, JSON.stringify(input.budgets), new Date().toISOString()]);
}

async function updateExecution(db, input) {
  await db.run(`UPDATE ontogenesis_execution SET phase = ?, pid = ?, executable = ?,
    result_json = ?, updated_at = datetime('now') WHERE id = ?
    AND phase IN ('prepared','running','finished','verified') AND (phase != 'verified' OR ? = 'verified')`,
  [input.phase, input.pid || null, input.executable || '', JSON.stringify(input.result || {}), input.id, input.phase]);
}

async function reservedBudgets(db, projectId) {
  const rows = await db.all("SELECT budgets_json FROM ontogenesis_execution WHERE project_id = ? AND phase IN ('prepared','running','finished','verified')", [projectId]);
  return rows.reduce((sum, row) => addBudgets(sum, JSON.parse(row.budgets_json)), { tokens: 0, usd: 0, seconds: 0 });
}

function addBudgets(sum, budget) {
  return { tokens: sum.tokens + budget.tokens, usd: sum.usd + budget.usd, seconds: sum.seconds + budget.seconds };
}

async function finalizeExecution(db, input) {
  return withTransaction(db, () => settleExecution(db, input));
}

async function settleExecution(db, input) {
  const info = await db.run("UPDATE ontogenesis_execution SET phase = ?, pid = NULL WHERE id = ? AND phase IN ('prepared','running','finished','verified')", [input.phase, input.run.id]);
  if (!info.changes) return;
  const budget = JSON.parse(input.run.budgets_json);
  await db.run(`INSERT INTO ontogenesis_spend (project_id, tokens, usd, seconds) VALUES (?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET tokens = tokens + excluded.tokens, usd = usd + excluded.usd, seconds = seconds + excluded.seconds`,
  [input.run.project_id, budget.tokens, budget.usd, budget.seconds]);
}

module.exports = { ensureTables, activeExecution, createExecution, updateExecution, reservedBudgets, finalizeExecution };
