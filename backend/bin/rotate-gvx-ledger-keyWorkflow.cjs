'use strict';

async function rollbackOpenTransaction(context) {
if (context.transactionOpen) await context.activeDb.run('ROLLBACK').catch(() => {});
}

async function rotateLedgerKey(context) {
try {
    context.process.env.GENOS_GVX_LEDGER_HMAC_SECRET = context.secret;
    await context.activeDb.run('BEGIN IMMEDIATE');
    context.transactionOpen = true;

    const updateGuard = await context.activeDb.get("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'gvx_events_no_update'");
    const deleteGuard = await context.activeDb.get("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'gvx_events_no_delete'");
    if (context.require('./rotate-gvx-ledger-keyRules.cjs').rotate({ deleteGuard, updateGuard })) {
      throw new context.Error('ledger-immutability-guards-unexpected');
    }
    // Keep the guard changes in the same SQLite transaction as the MAC-only
    // updates. A rollback restores the original immutability trigger.
    await context.activeDb.run('DROP TRIGGER gvx_events_no_update');

    context.rows = await context.ledgerRows(context.activeDb);
    const currentChains = context.assertChains(context.rows);
    if (currentChains !== context.chainCount) throw new context.Error('ledger-scope-set-changed');
    for (const row of context.rows) {
      const mac = context.integrity.macEvent(row.eventHash, context.secret);
      await context.activeDb.run('UPDATE gvx_development_events SET control_plane_mac = ? WHERE id = ?', mac, row.id);
    }

    await context.activeDb.exec(`CREATE TRIGGER gvx_events_no_update
      BEFORE UPDATE ON gvx_development_events BEGIN
        SELECT RAISE(ABORT, 'gvx_event_is_immutable');
      END`);
    const signedRows = await context.ledgerRows(context.activeDb);
    context.assertChains(signedRows, context.secret);
    const restoredGuard = await context.activeDb.get("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'gvx_events_no_update'");
    if (!restoredGuard?.sql) throw new context.Error('ledger-immutability-guard-not-restored');
    await context.activeDb.run('COMMIT');
    context.transactionOpen = false;
    context.committed = true;
    context.fs.renameSync(context.pendingPath, context.secretPath);
    return { value: ( { eventCount: signedRows.length, chainCount: context.chainCount, backupPath: context.backupPath, secretPath: context.secretPath }) };
  } catch (error) {
    await context.require('./rotate-gvx-ledger-keyWorkflow.cjs').rollbackOpenTransaction({ activeDb: context.activeDb, get transactionOpen() { return context.transactionOpen; }, set transactionOpen(nextValue) { context.transactionOpen = nextValue; } });
    if (!context.committed) {
      try { context.fs.unlinkSync(context.pendingPath); } catch (_) {}
    }
    throw error;
  }
}

module.exports = { rollbackOpenTransaction, rotateLedgerKey };
