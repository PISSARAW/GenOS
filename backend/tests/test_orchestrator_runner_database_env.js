'use strict';

const assert = require('node:assert/strict');
const { buildRunnerEnv } = require('../bin/runnerSpawn.cjs');

const previousBackup = process.env.GENOS_DB_BACKUP_SKIP;
const previousBootstrap = process.env.GENOS_DB_BOOTSTRAP_SKIP;

try {
  delete process.env.GENOS_DB_BACKUP_SKIP;
  delete process.env.GENOS_DB_BOOTSTRAP_SKIP;
  const environment = buildRunnerEnv();
  assert.equal(environment.GENOS_DB_BACKUP_SKIP, '1');
  assert.equal(environment.GENOS_DB_BOOTSTRAP_SKIP, '1');
} finally {
  if (previousBackup === undefined) delete process.env.GENOS_DB_BACKUP_SKIP;
  else process.env.GENOS_DB_BACKUP_SKIP = previousBackup;
  if (previousBootstrap === undefined) delete process.env.GENOS_DB_BOOTSTRAP_SKIP;
  else process.env.GENOS_DB_BOOTSTRAP_SKIP = previousBootstrap;
}

console.log('Orchestrator runner database environment: PASS');
