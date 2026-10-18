'use strict';

const collective = require('../collectiveStateService');
const snapshots = require('./morphogenesisTransitionSnapshotService');
const { migrateMorphogenesisTransitionSnapshots } = require('../../db/migrations/migrateMorphogenesisTransitionSnapshots');

const LIMIT = 100;

async function restorePrepared(db, row, options) {
  const loaded = await snapshots.load({ db, id: row.snapshot_id });
  const state = collective.deserializeState(loaded.payload.collectiveState);
  await snapshots.restore({ db, id: row.snapshot_id, collectiveState: state,
    snapshotStore: options.snapshotStore, error: 'startup_abort_prepared_transition' });
  await snapshots.appendAction({ db, transitionId: row.transition_id,
    receipt: { schema: 'genos.morphogenesis-transition-phase/v1', phase: 'ABORT',
      reason: 'startup_abort_prepared_transition', planHash: loaded.row.plan_hash } });
  return { transitionId: row.transition_id, status: 'ABORTED', snapshotId: row.snapshot_id };
}

async function quarantineAmbiguous(db, row) {
  const error = `startup_recovery_required:${row.status}:external_effects_may_be_ambiguous`;
  await snapshots.markRecoveryRequired({ db, id: row.snapshot_id, error });
  return { transitionId: row.transition_id, status: 'RECOVERY_REQUIRED',
    snapshotId: row.snapshot_id, reason: error };
}

async function recoverRow(db, row, options) {
  try {
    return row.status === 'prepared'
      ? await restorePrepared(db, row, options)
      : await quarantineAmbiguous(db, row);
  } catch (error) {
    await snapshots.markRecoveryRequired({ db, id: row.snapshot_id,
      error: `startup_recovery_failed:${error.message}` });
    return { transitionId: row.transition_id, status: 'RECOVERY_REQUIRED',
      snapshotId: row.snapshot_id, reason: error.message };
  }
}

async function recoverStartupTransitions(db, options = {}) {
  await migrateMorphogenesisTransitionSnapshots(db);
  const rows = await db.all(`SELECT snapshot_id, transition_id, status
    FROM morphogenesis_transition_snapshots
    WHERE status IN ('prepared','applying','restoring')
    ORDER BY created_at, snapshot_id LIMIT ?`, Number(options.limit || LIMIT));
  const results = [];
  for (const row of rows) results.push(await recoverRow(db, row, options));
  return { scanned: rows.length,
    aborted: results.filter(item => item.status === 'ABORTED').length,
    recoveryRequired: results.filter(item => item.status === 'RECOVERY_REQUIRED').length,
    truncated: rows.length === Number(options.limit || LIMIT), results };
}

module.exports = { recoverStartupTransitions };
