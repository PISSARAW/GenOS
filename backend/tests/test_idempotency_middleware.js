'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const dbModule = require('../src/db');
const { migrateIdempotencyKeys } = require('../src/db/migrations/migrateIdempotencyKeys');

function response() {
  const result = { statusCode: 200, headers: {}, body: null, sent: false };
  result.status = (code) => { result.statusCode = code; return result; };
  result.setHeader = (name, value) => { result.headers[name] = value; };
  result.removeHeader = (name) => { delete result.headers[name]; };
  result.end = (body) => { result.body = body; result.sent = true; return result; };
  result.write = (body) => { result.body = body; return true; };
  result.writeHead = (code) => { result.statusCode = code; return result; };
  result.flushHeaders = () => result;
  result.json = (body) => { result.end(JSON.stringify(body)); return result; };
  result.send = (body) => { result.end(body); return result; };
  return result;
}

function request(body, key = 'same-key') {
  return { body, path: '/effect', originalUrl: '/effect', method: 'POST',
    headers: { 'x-idempotency-key': key }, user: { keyId: 'test-principal' } };
}

async function invoke(middleware, req, handler) {
  const res = response();
  await middleware(req, res, () => handler(res));
  return res;
}

async function waitUntil(predicate) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('Timed out waiting for the idempotent response.');
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const originalGetDatabase = dbModule.getDatabase;
  try {
    await db.exec(`CREATE TABLE idempotency_keys (
      key TEXT PRIMARY KEY, response_payload TEXT NOT NULL DEFAULT '{}',
      status_code INTEGER NOT NULL DEFAULT 200, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await migrateIdempotencyKeys(db);
    assert.ok((await db.all('PRAGMA table_info(idempotency_keys)')).some((column) => column.name === 'request_hash'));
    dbModule.getDatabase = async () => db;
    const { idempotencyMiddleware, cleanupOldKeys } = require('../src/middleware/idempotency');
    const middleware = idempotencyMiddleware();
    let effects = 0;
    const first = await invoke(middleware, request({ value: 1 }), (res) => {
      effects++;
      res.status(201).json({ effect: effects });
    });
    assert.equal(first.sent, false, '2xx waits for the SQLite receipt');
    await waitUntil(() => first.sent);
    assert.equal(first.statusCode, 201);
    assert.equal((await db.get('SELECT response_payload FROM idempotency_keys')).response_payload, '{"effect":1}');

    const replay = await invoke(middleware, request({ value: 1 }), () => { effects++; });
    assert.equal(replay.statusCode, 201);
    assert.equal(replay.headers['X-Idempotency-Replay'], 'true');
    assert.equal(effects, 1);

    const conflict = await invoke(middleware, request({ value: 2 }), () => { effects++; });
    assert.equal(conflict.statusCode, 409);
    assert.equal(JSON.parse(conflict.body).code, 'IDEMPOTENCY_KEY_CONFLICT');
    assert.equal(effects, 1);

    const unsupportedRequest = request({ value: 3 }, 'non-json-key');
    const unsupported = await invoke(middleware, unsupportedRequest, (res) => {
      effects++;
      res.status(200).send('not replayable');
    });
    assert.equal(unsupported.statusCode, 503);
    assert.equal(JSON.parse(unsupported.body).code, 'IDEMPOTENCY_RESPONSE_UNSUPPORTED');
    const unsupportedHash = require('node:crypto').createHash('sha256').update(JSON.stringify({
      body: { value: 3 }, headers: { 'if-match': '', 'if-none-match': '', 'x-attempt': '',
        'x-mission-id': '', 'x-step': '', 'x-tool-name': '' }
    })).digest('hex');
    assert.equal((await db.get('SELECT response_payload FROM idempotency_keys WHERE request_hash = ?', unsupportedHash))
      .response_payload, '__IN_FLIGHT__');

    const stream = await invoke(middleware, request({ value: 5 }, 'stream-key'), (res) => {
      effects++;
      res.write('partial response');
    });
    assert.equal(stream.statusCode, 503);
    assert.equal(JSON.parse(stream.body).code, 'IDEMPOTENCY_RESPONSE_UNSUPPORTED');

    const uncertainRequest = request({ value: 4 }, 'uncertain-key');
    const originalRun = db.run.bind(db);
    const originalError = console.error;
    console.error = () => {};
    db.run = (sql, ...params) => {
      if (sql.includes('UPDATE idempotency_keys SET response_payload')) throw new Error('receipt-write-failed');
      return originalRun(sql, ...params);
    };
    const uncertain = await invoke(middleware, uncertainRequest, (res) => {
      effects++;
      res.status(200).json({ effect: effects });
    });
    await waitUntil(() => uncertain.sent);
    assert.equal(uncertain.statusCode, 503);
    db.run = originalRun;
    console.error = originalError;
    await db.run("UPDATE idempotency_keys SET created_at = datetime('now', '-6 minutes') WHERE response_payload = ?",
      '__IN_FLIGHT__');
    const retry = await invoke(middleware, request({ value: 4 }, 'uncertain-key'), () => { effects++; });
    assert.equal(retry.statusCode, 409);
    assert.equal(JSON.parse(retry.body).code, 'IDEMPOTENCY_OUTCOME_UNCERTAIN');
    assert.equal(effects, 4, 'uncertain effects are not automatically repeated');
    await cleanupOldKeys();
    assert.ok((await db.get("SELECT COUNT(*) AS count FROM idempotency_keys WHERE response_payload = '__IN_FLIGHT__'")).count > 0,
      'uncertain reservations are not removed by response TTL cleanup');
  } finally {
    dbModule.getDatabase = originalGetDatabase;
    await db.close();
  }
}

run().then(() => console.log('HTTP idempotency request binding and replay checks passed.'))
  .catch((failure) => { console.error(failure); process.exitCode = 1; });
