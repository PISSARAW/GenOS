'use strict';

const catalog = require('../gqwf/catalog');
const { withTransaction, isTransactionActive } = require('../../db');

async function defer(options) {
  await options.assertSafeCas();
  const result = await withTransaction(options.db, async () => {
    await options.db.exec(`CREATE TABLE IF NOT EXISTS gqwf_exchange_catalog_pending (
      workspace_id TEXT PRIMARY KEY,version INTEGER NOT NULL
    );`);
    await options.db.run(`INSERT INTO gqwf_exchange_catalog_pending VALUES(?,1)
      ON CONFLICT(workspace_id) DO UPDATE SET version=version+1`, options.workspaceId);
    return options.run();
  });
  await options.assertSafeCas();
  return result;
}

async function flushDeferredCheckpoint(options) {
  if (isTransactionActive(options.db)) return { status: 'catalog_pending_outer_transaction' };
  const pending = await withTransaction(options.db, async () => {
    const table = await options.db.get("SELECT name FROM sqlite_master WHERE name='gqwf_exchange_catalog_pending'");
    return table ? options.db.get('SELECT version FROM gqwf_exchange_catalog_pending WHERE workspace_id=?', options.workspaceId) : null;
  });
  if (!pending) return { status: 'catalog_current' };
  await options.assertSafeCas();
  await catalog.checkpointMetadata(options.db, { workspaceId: options.workspaceId });
  await options.assertSafeCas();
  await withTransaction(options.db, () => options.db.run('DELETE FROM gqwf_exchange_catalog_pending WHERE workspace_id=? AND version=?',
    options.workspaceId, pending.version));
  return { status: 'catalog_reconciled_from_primary' };
}

async function guardedMutation(options) {
  if (options.deferCatalogCheckpoint === true || isTransactionActive(options.db)) return defer(options);
  await options.assertSafeCas();
  let result;
  let mutationError;
  try { result = await options.run(); }
  catch (error) { mutationError = error; }
  await options.assertSafeCas();
  try { await catalog.checkpointMetadata(options.db, { workspaceId: options.workspaceId }); }
  catch (error) {
    if (!mutationError) throw error;
    mutationError.cause = error;
  }
  await options.assertSafeCas();
  if (mutationError) throw mutationError;
  return result;
}

module.exports = { guardedMutation, flushDeferredCheckpoint };
