'use strict';

const { CasAdapter } = require('../gqwfExchange/casAdapter');
const { samePath } = require('../gqwfExchange/casSafety');
const { flushDeferredCheckpoint } = require('../gqwfExchange/promotionCatalog');
const context = require('./context');

async function reconcile(db, input) {
  const binding = await context.load(db, input.runId);
  if (!binding) return { status: 'not_applicable' };
  const table = await db.get("SELECT name FROM sqlite_master WHERE name='gqwf_execution_sessions'");
  if (!table) return { status: 'not_applicable' };
  const row = await db.get('SELECT * FROM gqwf_execution_sessions WHERE execution_run_id=?', input.runId);
  if (!row) return { status: 'not_applicable' };
  await context.assertCurrent(binding);
  const workspace = await db.get('SELECT * FROM workspaces WHERE id=?', binding.workspaceId);
  if (row.workspace_id !== binding.workspaceId || workspace.organization_id !== binding.scope.organizationId ||
    workspace.project_id !== binding.scope.projectId || !samePath(workspace.path, row.source_path)) {
    throw new Error('MISSION_GQWF_CATALOG_SCOPE_MISMATCH');
  }
  const cas = new CasAdapter(workspace.path);
  return flushDeferredCheckpoint({ db, workspaceId: binding.workspaceId, assertSafeCas: () => cas.prepare() });
}

module.exports = { reconcile };
