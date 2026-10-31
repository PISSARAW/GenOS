'use strict';

async function rotateStage1(__genosStageScope1) {
if (__genosStageScope1.transactionOpen) await __genosStageScope1.activeDb.run('ROLLBACK').catch(() => {});
}

async function rotateStage2(__genosStageScope2) {
try {
    __genosStageScope2.process.env.GENOS_GVX_LEDGER_HMAC_SECRET = __genosStageScope2.secret;
    await __genosStageScope2.activeDb.run('BEGIN IMMEDIATE');
    __genosStageScope2.transactionOpen = true;

    const updateGuard = await __genosStageScope2.activeDb.get("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'gvx_events_no_update'");
    const deleteGuard = await __genosStageScope2.activeDb.get("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'gvx_events_no_delete'");
    if ((0, __genosStageScope2.require)('./rotate-gvx-ledger-keyValues1.cjs').rotateValue1({ deleteGuard, updateGuard })) {
      throw new __genosStageScope2.Error('ledger-immutability-guards-unexpected');
    }
    // Keep the guard changes in the same SQLite transaction as the MAC-only
    // updates. A rollback restores the original immutability trigger.
    await __genosStageScope2.activeDb.run('DROP TRIGGER gvx_events_no_update');

    __genosStageScope2.rows = await (0, __genosStageScope2.ledgerRows)(__genosStageScope2.activeDb);
    const currentChains = (0, __genosStageScope2.assertChains)(__genosStageScope2.rows);
    if (currentChains !== __genosStageScope2.chainCount) throw new __genosStageScope2.Error('ledger-scope-set-changed');
    for (const row of __genosStageScope2.rows) {
      const mac = __genosStageScope2.integrity.macEvent(row.eventHash, __genosStageScope2.secret);
      await __genosStageScope2.activeDb.run('UPDATE gvx_development_events SET control_plane_mac = ? WHERE id = ?', mac, row.id);
    }

    await __genosStageScope2.activeDb.exec(`CREATE TRIGGER gvx_events_no_update
      BEFORE UPDATE ON gvx_development_events BEGIN
        SELECT RAISE(ABORT, 'gvx_event_is_immutable');
      END`);
    const signedRows = await (0, __genosStageScope2.ledgerRows)(__genosStageScope2.activeDb);
    (0, __genosStageScope2.assertChains)(signedRows, __genosStageScope2.secret);
    const restoredGuard = await __genosStageScope2.activeDb.get("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'gvx_events_no_update'");
    if (!restoredGuard?.sql) throw new __genosStageScope2.Error('ledger-immutability-guard-not-restored');
    await __genosStageScope2.activeDb.run('COMMIT');
    __genosStageScope2.transactionOpen = false;
    __genosStageScope2.committed = true;
    __genosStageScope2.fs.renameSync(__genosStageScope2.pendingPath, __genosStageScope2.secretPath);
    return { value: ( { eventCount: signedRows.length, chainCount: __genosStageScope2.chainCount, backupPath: __genosStageScope2.backupPath, secretPath: __genosStageScope2.secretPath }) };
  } catch (error) {
    await (0, __genosStageScope2.require)('./rotate-gvx-ledger-keyStages1.cjs').rotateStage1({ activeDb: __genosStageScope2.activeDb, get transactionOpen() { return __genosStageScope2.transactionOpen; }, set transactionOpen(__genosNextStageValue) { __genosStageScope2.transactionOpen = __genosNextStageValue; } });
    if (!__genosStageScope2.committed) {
      try { __genosStageScope2.fs.unlinkSync(__genosStageScope2.pendingPath); } catch (_) {}
    }
    throw error;
  }
}

module.exports = { rotateStage1, rotateStage2 };
