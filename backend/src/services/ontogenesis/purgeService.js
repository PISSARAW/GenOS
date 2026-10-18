'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { withTransaction } = require('../../db');
const { runCommand } = require('../agentWorkspaceLifecycle/git');
const { requireProject } = require('./operatorService');
const { managedRoot } = require('./worktreeService');
const { acquireClaim, extendClaim, releaseClaim } = require('./claimService');
const { canonicalJson } = require('./durableJson');

const TRACE_TABLES = ['trace_spans', 'telemetry_events', 'telemetry_hourly_stats', 'audit_logs'];
const PROJECT_TABLES = [
  'ontogenesis_recovery_receipts', 'ontogenesis_artifacts', 'ontogenesis_outbox',
  'ontogenesis_operations', 'ontogenesis_execution', 'ontogenesis_pressure',
  'ontogenesis_integrations', 'ontogenesis_decisions', 'ontogenesis_runs',
  'ontogenesis_approval_requests', 'ontogenesis_questions', 'ontogenesis_summaries',
  'ontogenesis_notifications', 'ontogenesis_events', 'ontogenesis_inbox',
  'ontogenesis_memory', 'ontogenesis_ledger', 'ontogenesis_spend',
  'ontogenesis_continuity_receipts', 'ontogenesis_handoffs'
];
const ACTIVE_PHASES = ['prepared', 'running', 'finished', 'verified'];
const FINAL_OPERATIONS = ['completed', 'failed', 'compensated', 'escalated'];

async function ensureTables(db) {
  await require('../../db/migrations/migrateOntogenesisPurge').migrateOntogenesisPurge(db);
}

async function tableExists(db, table) {
  return Boolean(await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]));
}

function parseWorktrees(output) {
  return output.split(/\r?\n/).filter((line) => line.startsWith('worktree '))
    .map((line) => path.resolve(line.slice('worktree '.length)));
}

function containedBy(root, candidate) {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function managedWorktrees(project) {
  const root = managedRoot(project);
  const listed = await runCommand('git', ['worktree', 'list', '--porcelain'], { cwd: project.root_path });
  return parseWorktrees(listed.stdout).filter((candidate) => containedBy(root, candidate))
    .sort((left, right) => right.length - left.length);
}

async function countTable(db, table, projectId) {
  if (!await tableExists(db, table)) return 0;
  const row = await db.get(`SELECT COUNT(*) AS count FROM ${table} WHERE project_id = ?`, [projectId]);
  return Number(row?.count || 0);
}

async function collectCounts(db, projectId) {
  const counts = {};
  for (const table of [...PROJECT_TABLES, ...TRACE_TABLES]) counts[table] = await countTable(db, table, projectId);
  return counts;
}

async function assertStopped(db, project) {
  const control = await db.get('SELECT mode FROM ontogenesis_control WHERE project_id = ?', [project.id]);
  if (project.state !== 'STOPPED' || control?.mode !== 'stopped') throw new Error('purge-projet-non-arrete');
  const continuity = await db.get('SELECT state FROM ontogenesis_continuity WHERE project_id = ?', [project.id]);
  if (continuity && continuity.state !== 'local') throw new Error(`purge-continuite-active:${continuity.state}`);
}

async function assertQuiescent(db, projectId) {
  const phases = ACTIVE_PHASES.map(() => '?').join(',');
  const execution = await db.get(
    `SELECT id FROM ontogenesis_execution WHERE project_id = ? AND phase IN (${phases})`,
    [projectId, ...ACTIVE_PHASES]
  );
  if (execution) throw new Error('purge-execution-active');
  const states = FINAL_OPERATIONS.map(() => '?').join(',');
  const operation = await db.get(
    `SELECT id FROM ontogenesis_operations WHERE project_id = ? AND state NOT IN (${states})`,
    [projectId, ...FINAL_OPERATIONS]
  );
  if (operation) throw new Error('purge-operation-incomplete');
  const held = await db.get(
    "SELECT id FROM ontogenesis_artifacts WHERE project_id = ? AND legal_hold = 1 AND state != 'purged'",
    [projectId]
  );
  if (held) throw new Error('purge-gel-juridique');
}

async function buildPlan(db, project) {
  const root = managedRoot(project);
  const worktrees = await managedWorktrees(project);
  const counts = await collectCounts(db, project.id);
  const manifest = { version: 1, projectId: project.id, scope: 'traces-and-managed-worktrees',
    worktreeCount: worktrees.length, rootPresent: fs.existsSync(root), counts };
  return { root, worktrees, counts, manifestHash: crypto.createHash('sha256')
    .update(canonicalJson(manifest)).digest('hex') };
}

async function planPurge(db, input) {
  await ensureTables(db);
  const project = await requireProject(db, input.projectId);
  await assertStopped(db, project);
  await assertQuiescent(db, project.id);
  return buildPlan(db, project);
}

async function prepareReceipt(db, input) {
  const prior = await db.get(`SELECT * FROM ontogenesis_purge_receipts
    WHERE project_id = ? AND state = 'prepared' ORDER BY created_at DESC LIMIT 1`, [input.projectId]);
  if (prior) return prior;
  const id = `onto_purge_${crypto.randomUUID()}`;
  await db.run(`INSERT INTO ontogenesis_purge_receipts
    (id, project_id, manifest_hash, scope_json, counts_json) VALUES (?, ?, ?, ?, ?)`,
  [id, input.projectId, input.manifestHash,
    canonicalJson({ version: 1, scope: 'traces-and-managed-worktrees' }), canonicalJson(input.counts)]);
  return db.get('SELECT * FROM ontogenesis_purge_receipts WHERE id = ?', [id]);
}

async function removeManagedFiles(project, plan, fence) {
  for (const worktree of plan.worktrees) {
    await fence();
    await runCommand('git', ['worktree', 'remove', '--force', worktree], { cwd: project.root_path });
  }
  await fence();
  if ((await managedWorktrees(project)).length) throw new Error('purge-worktree-apparu-concurremment');
  if (!fs.existsSync(plan.root)) return;
  if (fs.lstatSync(plan.root).isSymbolicLink()) throw new Error('purge-racine-symbolique');
  fs.rmSync(plan.root, { recursive: true, force: true });
}

async function deleteProjectRows(db, projectId) {
  const deleted = {};
  await db.run(`UPDATE ontogenesis_continuity SET state = 'local', active_host_id = NULL,
    handoff_id = NULL, lease_expires_at = NULL, updated_at = datetime('now') WHERE project_id = ?`, [projectId]);
  for (const table of [...PROJECT_TABLES, ...TRACE_TABLES]) {
    if (!await tableExists(db, table)) continue;
    const result = await db.run(`DELETE FROM ${table} WHERE project_id = ?`, [projectId]);
    deleted[table] = result.changes || 0;
  }
  return deleted;
}

async function markCompleted(db, receipt, deleted) {
  await db.run(`UPDATE ontogenesis_purge_receipts SET state = 'completed', counts_json = ?,
    completed_at = datetime('now') WHERE id = ? AND state = 'prepared'`, [canonicalJson(deleted), receipt.id]);
}

async function markFailed(db, receipt, error) {
  if (!receipt) return;
  const known = String(error.message || '').match(/^(purge-[a-z-]+|claim-[a-z-]+)/);
  await db.run(`UPDATE ontogenesis_purge_receipts SET state = 'failed', error = ?,
    completed_at = datetime('now') WHERE id = ? AND state = 'prepared'`, [known?.[1] || 'purge-echec', receipt.id]);
}

async function purgeProject(db, input) {
  if (input.confirmation !== input.projectId) throw new Error('confirmation-projet-requise');
  await ensureTables(db);
  const project = await requireProject(db, input.projectId);
  const owner = `purge:${crypto.randomUUID()}`;
  const claim = await acquireClaim(db, { projectId: project.id, owner, ttlMs: 120000 });
  if (!claim.acquired) throw new Error('claim-actif');
  const lease = { projectId: project.id, owner, operationId: claim.operationId, ttlMs: 120000 };
  let receipt;
  try {
    await assertStopped(db, project);
    await assertQuiescent(db, project.id);
    const plan = await buildPlan(db, project);
    receipt = await prepareReceipt(db, { projectId: project.id, ...plan });
    await removeManagedFiles(project, plan, () => extendClaim(db, lease));
    const deleted = await withTransaction(db, async () => {
      const counts = await deleteProjectRows(db, project.id);
      await markCompleted(db, receipt, counts);
      return counts;
    });
    return { receiptId: receipt.id, manifestHash: receipt.manifest_hash, worktrees: plan.worktrees.length, deleted };
  } catch (error) {
    await markFailed(db, receipt, error).catch(() => {});
    throw error;
  } finally {
    await releaseClaim(db, lease);
  }
}

module.exports = { planPurge, purgeProject };
