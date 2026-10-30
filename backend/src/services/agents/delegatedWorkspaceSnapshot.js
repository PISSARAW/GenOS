'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const values = require('../trinityProvenanceValues');
const paths = require('../localCodeWorkerService');

function denied() { return Object.assign(new Error('Delegated review snapshot is not a current tested sibling artifact.'), { code: 'DELEGATION_REVIEW_SNAPSHOT_INVALID' }); }

async function sourceReceipt(db, input) {
  const source = await db.get(`SELECT a.id,a.parent_agent_id,w.path,w.organization_id,w.project_id FROM agents a
    JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=?`, input.sourceChildId);
  if (source?.parent_agent_id !== input.parentId) throw denied();
  const row = await db.get(`SELECT r.* FROM local_code_test_execution_receipts r
    JOIN strategy_execution_runs run ON run.id=r.execution_run_id
    WHERE r.agent_id=? AND r.mission_id=? AND r.outcome='passed' AND run.status='completed'
    ORDER BY r.rowid DESC LIMIT 1`, source.id, input.missionId);
  if (!row) throw denied();
  const receipt = JSON.parse(row.receipt_json);
  if (require('../biologicalIntegrity').digest(receipt) !== row.receipt_hash || receipt.agentId !== source.id
    || receipt.executionRunId !== row.execution_run_id || receipt.missionId !== input.missionId) throw denied();
  return { source, receipt, row };
}

async function assertTarget(db, input, source) {
  const target = await db.get(`SELECT a.parent_agent_id,w.path,w.organization_id,w.project_id FROM agents a
    JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=?`, input.childId);
  if (target?.parent_agent_id !== input.parentId || path.resolve(target.path) !== path.resolve(input.targetRoot)
    || target.organization_id !== source.organization_id || target.project_id !== source.project_id) throw denied();
}

async function copyFile(input) {
  const { sourceRoot, targetRoot, file } = input;
  if (!paths.safePath(file.path)) throw denied();
  const source = path.resolve(sourceRoot, file.path);
  const target = path.resolve(targetRoot, file.path);
  await paths.assertNoSymlinkPath(sourceRoot, source);
  await paths.assertNoSymlinkPath(targetRoot, target);
  const stat = await fs.stat(source);
  if (!stat.isFile() || stat.size > 1024 * 1024) throw denied();
  const bytes = await fs.readFile(source);
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== file.hash) throw denied();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${crypto.randomUUID()}.review.tmp`;
  await fs.writeFile(temporary, bytes, { flag: 'wx' });
  try { await fs.rename(temporary, target); }
  finally { await fs.unlink(temporary).catch(() => {}); }
}

async function materialize(db, input) {
  const { source, receipt, row } = await sourceReceipt(db, input);
  await assertTarget(db, input, source);
  const allowed = input.allowedWritePaths || [];
  const files = receipt.changedFileHashes.filter(file => allowed.includes(file.path));
  if (!files.length || files.length !== receipt.changedFileHashes.length) throw denied();
  for (const file of files) await copyFile({ sourceRoot: source.path, targetRoot: input.targetRoot, file });
  const snapshot = { sourceWorkerId: source.id, sourceRunId: row.execution_run_id,
    sourceReceiptHash: row.receipt_hash, reviewerId: input.childId, missionId: input.missionId, files };
  const scope = await require('../gvxMissionProvenance').agentScope(db, input.parentId);
  const saved = await require('../gvxDevelopmentLedger').appendEvent(db, {
    id: `gvx-delegation-review:${input.childId}`, ...scope, type: 'decision_recorded',
    payload: { kind: 'delegated_review_snapshot', snapshot } });
  return { ...snapshot, hash: values.digest(snapshot), receiptRef: `genos://delegated-review/${saved.id}` };
}

module.exports = { materialize, sourceReceipt };
