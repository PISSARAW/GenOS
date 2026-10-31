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
  { const __genosStageResult2 = await require('./rotate-gvx-ledger-keyStages1.cjs').rotateStage2({ Error, activeDb, assertChains, backupPath, chainCount, get committed() { return committed; }, set committed(__genosNextStageValue) { committed = __genosNextStageValue; }, fs, integrity, ledgerRows, pendingPath, get process() { return process; }, set process(__genosNextStageValue) { process = __genosNextStageValue; }, require, get rows() { return rows; }, set rows(__genosNextStageValue) { rows = __genosNextStageValue; }, secret, secretPath, get transactionOpen() { return transactionOpen; }, set transactionOpen(__genosNextStageValue) { transactionOpen = __genosNextStageValue; } }); if (__genosStageResult2) return __genosStageResult2.value; }
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
