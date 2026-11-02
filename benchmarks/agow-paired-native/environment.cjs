'use strict';

const path = require('node:path');

function environment(directory) {
  return { ...process.env, NODE_ENV: 'test', GENOS_TEST_MODE: '1', GENOS_DISABLE_DOTENV: '1',
    GENOS_SKIP_BOOT_DB_BACKUP: '1', GENOS_DB_BACKUP_SKIP: '1',
    GENOS_DB_PATH: path.join(directory, 'mission.sqlite'),
    GENOS_STUDIO_ROOT: path.join(directory, 'studio'), GENOS_CAPSULE_ROOT: path.join(directory, 'capsules'),
    GENOS_WORKSPACES_ROOT: directory, GENOS_DISABLE_WORKSPACE_GC: '1',
    GENOS_EPISTEMIC_RECEIPT_SECRET: 'agow-paired-local-qualification-only',
    GENOS_GVX_LEDGER_HMAC_SECRET: 'p1-delegation-test-only', GENOS_AGOW_MODE: 'shadow' };
}

async function close(db) {
  await require('../../backend/src/services/garageRuntimeService').stop(db);
  await require('../../backend/tests/helpers/flushTelemetrySideEffects').flushTelemetrySideEffects();
  await db.get('PRAGMA wal_checkpoint(TRUNCATE)');
  await require('../../backend/src/db').closeDatabase();
}

module.exports = { environment, close };
