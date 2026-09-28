'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const child = spawnSync(process.execPath, ['-e', `
  const { getDatabase } = require('./src/db');
  getDatabase().then(() => process.exit(2)).catch((error) => {
    if (error.code !== 'STORAGE_BACKEND_MIGRATION_REQUIRED') process.exit(3);
  });
`], {
  cwd: require('node:path').join(__dirname, '..'),
  env: { ...process.env, GENOS_STORAGE_BACKEND: 'postgresql' },
  encoding: 'utf8',
});

assert.equal(child.status, 0, child.stderr || child.stdout);
console.log('Storage bootstrap backend gate: PostgreSQL selection fails closed before SQLite opens.');
