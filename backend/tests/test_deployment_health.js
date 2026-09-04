const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const databasePath = path.join(os.tmpdir(), `genos-health-${process.pid}-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.GENOS_DB_PATH = databasePath;
process.env.GENOS_ADMIN_TOKEN = 'health-test-admin-token';

const { closeDatabase } = require('./src/db');
const health = require('./src/controllers/healthController');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

async function run() {
  const live = response();
  health.getLiveness({}, live);
  assert.equal(live.statusCode, 200);
  assert.equal(live.body.checks.process, 'ok');

  const ready = response();
  await health.getReadiness({}, ready);
  assert.equal(ready.statusCode, 200);
  assert.equal(ready.body.checks.database, 'ok');

  const startup = response();
  await health.getStartup({}, startup);
  assert.equal(startup.statusCode, 200);
  assert.equal(startup.body.checks.startup, 'complete');

  await closeDatabase();
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(`${databasePath}${suffix}`); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  console.log('Deployment health probes: ok');
}

run().catch(async error => {
  await closeDatabase();
  console.error(error);
  process.exitCode = 1;
});
