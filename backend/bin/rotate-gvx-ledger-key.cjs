'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const integrity = require('../src/services/gvxLedgerIntegrity');

function databaseArgument(argv) {
  const index = argv.indexOf('--db');
  if (index < 0 || !argv[index + 1]) throw new Error('usage: rotate-gvx-ledger-key.cjs --db PATH --confirm-resign');
  if (!argv.includes('--confirm-resign')) throw new Error('explicit --confirm-resign is required');
  if (argv[index + 1] === ':memory:') throw new Error('file-backed database required');
  return path.resolve(argv[index + 1]);
}

function groupsOf(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.organizationId, row.projectId, row.entityId]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()];
}

function assertChains(rows, secret) {
  const groups = groupsOf(rows);
  for (const group of groups) {
    const result = integrity.verifyRows(group, secret ? { secret } : {});
    if (!result.valid) {
      throw Object.assign(new Error(`ledger-chain-invalid:${result.reason}`), {
        code: 'GVX_LEDGER_CHAIN_INVALID', integrity: result
      });
    }
  }
  return groups.length;
}

async function ledgerRows(db) {
  return db.all(`SELECT id, organization_id AS organizationId, project_id AS projectId,
    entity_id AS entityId, event_type AS type, parent_hash AS parentHash,
    candidate_hash AS candidateHash, payload_json AS payloadJson, created_at AS createdAt,
    previous_event_hash AS previousEventHash, event_hash AS eventHash,
    control_plane_mac AS controlPlaneMac
    FROM gvx_development_events ORDER BY organization_id, project_id, entity_id, rowid`);
}

async function rotate(db, dbPath) {
  const secretPath = `${dbPath}.gvx-ledger-hmac`;
  const pendingPath = `${secretPath}.pending`;
  if (fs.existsSync(secretPath) || fs.existsSync(pendingPath)) {
    throw Object.assign(new Error('database-ledger-key-already-configured'), {
      code: 'DATABASE_LEDGER_KEY_ALREADY_CONFIGURED'
    });
  }

  let rows = await ledgerRows(db);
  if (rows.length === 0) throw new Error('ledger-empty');
  const chainCount = assertChains(rows);

  const checkpoint = await db.get('PRAGMA wal_checkpoint(TRUNCATE)');
  if (checkpoint && Number(checkpoint.busy) !== 0) throw new Error('database-checkpoint-busy');
  await require('../src/db').closeDatabase();

  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, 'Z');
  const backupPath = `${dbPath}.pre-hmac-rotation-${timestamp}.bak`;
  fs.copyFileSync(dbPath, backupPath, fs.constants.COPYFILE_EXCL);

  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(pendingPath, secret, { flag: 'wx', mode: 0o600 });
  const activeDb = await require('../src/db').getDatabase(dbPath);
  let transactionOpen = false;
  let committed = false;
  try {
    process.env.GENOS_GVX_LEDGER_HMAC_SECRET = secret;
    await activeDb.run('BEGIN IMMEDIATE');
    transactionOpen = true;

    const updateGuard = await activeDb.get("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'gvx_events_no_update'");
    const deleteGuard = await activeDb.get("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'gvx_events_no_delete'");
    if (!updateGuard?.sql || !/BEFORE\s+UPDATE\s+ON\s+gvx_development_events/i.test(updateGuard.sql)
        || !/RAISE\s*\(\s*ABORT\s*,\s*'gvx_event_is_immutable'\s*\)/i.test(updateGuard.sql)
        || !deleteGuard?.sql || !/BEFORE\s+DELETE\s+ON\s+gvx_development_events/i.test(deleteGuard.sql)
        || !/RAISE\s*\(\s*ABORT\s*,\s*'gvx_event_is_immutable'\s*\)/i.test(deleteGuard.sql)) {
      throw new Error('ledger-immutability-guards-unexpected');
    }
    // Keep the guard changes in the same SQLite transaction as the MAC-only
    // updates. A rollback restores the original immutability trigger.
    await activeDb.run('DROP TRIGGER gvx_events_no_update');

    rows = await ledgerRows(activeDb);
    const currentChains = assertChains(rows);
    if (currentChains !== chainCount) throw new Error('ledger-scope-set-changed');
    for (const row of rows) {
      const mac = integrity.macEvent(row.eventHash, secret);
      await activeDb.run('UPDATE gvx_development_events SET control_plane_mac = ? WHERE id = ?', mac, row.id);
    }

    await activeDb.exec(`CREATE TRIGGER gvx_events_no_update
      BEFORE UPDATE ON gvx_development_events BEGIN
        SELECT RAISE(ABORT, 'gvx_event_is_immutable');
      END`);
    const signedRows = await ledgerRows(activeDb);
    assertChains(signedRows, secret);
    const restoredGuard = await activeDb.get("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'gvx_events_no_update'");
    if (!restoredGuard?.sql) throw new Error('ledger-immutability-guard-not-restored');
    await activeDb.run('COMMIT');
    transactionOpen = false;
    committed = true;
    fs.renameSync(pendingPath, secretPath);
    return { eventCount: signedRows.length, chainCount, backupPath, secretPath };
  } catch (error) {
    if (transactionOpen) await activeDb.run('ROLLBACK').catch(() => {});
    if (!committed) {
      try { fs.unlinkSync(pendingPath); } catch (_) {}
    }
    throw error;
  }
}

async function main(argv = process.argv.slice(2)) {
  const dbPath = databaseArgument(argv);
  const db = require('../src/db');
  const priorBootstrap = process.env.GENOS_DB_BOOTSTRAP_SKIP;
  const priorBackup = process.env.GENOS_DB_BACKUP_SKIP;
  delete process.env.GENOS_GVX_LEDGER_HMAC_SECRET;
  process.env.GENOS_DB_BOOTSTRAP_SKIP = '1';
  process.env.GENOS_DB_BACKUP_SKIP = '1';
  try {
    const connection = await db.getDatabase(dbPath);
    const result = await rotate(connection, dbPath);
    console.log(JSON.stringify({ ...result, signatures: 'rotated', secret: '[stored locally; not printed]' }));
  } finally {
    await db.closeDatabase();
    if (priorBootstrap === undefined) delete process.env.GENOS_DB_BOOTSTRAP_SKIP;
    else process.env.GENOS_DB_BOOTSTRAP_SKIP = priorBootstrap;
    if (priorBackup === undefined) delete process.env.GENOS_DB_BACKUP_SKIP;
    else process.env.GENOS_DB_BACKUP_SKIP = priorBackup;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { databaseArgument, groupsOf, assertChains, ledgerRows, rotate };
