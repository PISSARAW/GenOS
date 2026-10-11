'use strict';

const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
const sqlite3 = require('sqlite3');

const dbPath = process.env.GENOS_CREDIT_PROVIDER_DB;
const keyPath = process.env.GENOS_CREDIT_PROVIDER_KEY_PATH;
const token = process.env.GENOS_CREDIT_PROVIDER_TOKEN;
const initial = Number(process.env.GENOS_CREDIT_PROVIDER_INITIAL || 1000);
if (!dbPath || !keyPath || !token || !Number.isSafeInteger(initial) || initial <= 0) {
  throw new Error('Provider DB, key, token and positive initial reserve are required.');
}
const privateKey = fs.readFileSync(keyPath);
const db = new sqlite3.Database(dbPath);
db.configure('busyTimeout', 5000);
let queue = Promise.resolve();
let dropTransferOnce = process.env.GENOS_CREDIT_PROVIDER_DROP_TRANSFER_ONCE === '1';
const run = (sql, values = []) => new Promise((resolve, reject) => db.run(sql, values, function done(error) {
  if (error) reject(error); else resolve({ changes: this.changes });
}));
const get = (sql, values = []) => new Promise((resolve, reject) => db.get(sql, values,
  (error, row) => error ? reject(error) : resolve(row)));
const all = (sql, values = []) => new Promise((resolve, reject) => db.all(sql, values,
  (error, rows) => error ? reject(error) : resolve(rows)));
const sign = (statement) => ({ statement, signature: crypto.sign(null,
  Buffer.from(JSON.stringify(statement)), privateKey).toString('base64') });
const account = (v) => [v.tenantId, v.missionId, v.agentId];
const validId = (v) => typeof v === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(v);
const validAccount = (v) => v && account(v).every(validId);
const amount = (v) => Number.isSafeInteger(v) && v > 0;
const fail = (code, message) => Object.assign(new Error(message), { code });

async function initialize() {
  await run('PRAGMA journal_mode=WAL');
  await run('CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY CHECK(id=1), initial INTEGER NOT NULL, reserve INTEGER NOT NULL, spent INTEGER NOT NULL, version INTEGER NOT NULL)');
  await run('CREATE TABLE IF NOT EXISTS accounts (tenant_id TEXT NOT NULL, mission_id TEXT NOT NULL, agent_id TEXT NOT NULL, capacity INTEGER NOT NULL, balance INTEGER NOT NULL, version INTEGER NOT NULL, PRIMARY KEY(tenant_id,mission_id,agent_id))');
  await run('CREATE TABLE IF NOT EXISTS operations (operation_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, response_json TEXT NOT NULL)');
  await run('INSERT OR IGNORE INTO ledger (id,initial,reserve,spent,version) VALUES (1,?,?,0,0)', [initial, initial]);
}

async function transaction(work) {
  await run('BEGIN IMMEDIATE');
  try {
    const result = await work();
    await run('COMMIT');
    return result;
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  }
}

function serialized(work) {
  const next = queue.then(() => transaction(work));
  queue = next.catch(() => {});
  return next;
}

async function accountRow(input) {
  return get('SELECT * FROM accounts WHERE tenant_id=? AND mission_id=? AND agent_id=?', account(input));
}

async function observation(input) {
  if (!validAccount(input)) throw fail('ACCOUNT_INVALID', 'Valid tenant, mission and agent are required.');
  const row = await accountRow(input);
  if (!row) throw fail('ACCOUNT_NOT_FOUND', 'Account does not exist.');
  const ledger = await get('SELECT * FROM ledger WHERE id=1');
  return sign({ schema: 'genos.external-credit-observation/v1', providerId: 'controlled-credit-provider',
    tenantId: input.tenantId, missionId: input.missionId, agentId: input.agentId,
    unit: 'execution_credit', balance: row.balance, capacity: row.capacity,
    accountVersion: row.version, reserve: ledger.reserve, spent: ledger.spent,
    ledgerVersion: ledger.version, observedAt: new Date().toISOString() });
}

async function seed(input) {
  if (!validAccount(input) || !amount(input.capacity)
    || !Number.isSafeInteger(input.balance) || input.balance < 0 || input.balance > input.capacity) {
    throw fail('SEED_INVALID', 'Account, capacity and starting balance are required.');
  }
  return serialized(async () => {
    const old = await accountRow(input);
    if (old) throw fail('ACCOUNT_EXISTS', 'Account already exists.');
    const ledger = await get('SELECT reserve FROM ledger WHERE id=1');
    if (ledger.reserve < input.balance) throw fail('RESERVE_EXHAUSTED', 'Insufficient reserve.');
    await run('INSERT INTO accounts VALUES (?,?,?,?,?,0)',
      [...account(input), input.capacity, input.balance]);
    await run('UPDATE ledger SET reserve=reserve-?,version=version+1 WHERE id=1', [input.balance]);
    return observation(input);
  });
}

function requestHash(input, kind) {
  return crypto.createHash('sha256').update(JSON.stringify({ kind, tenantId: input.tenantId,
    missionId: input.missionId, agentId: input.agentId, amount: input.amount,
    expectedVersion: input.expectedVersion })).digest('hex');
}

async function priorOperation(input, kind) {
  const existing = await get('SELECT * FROM operations WHERE operation_id=?', [input.operationId]);
  if (!existing) return null;
  if (existing.request_hash !== requestHash(input, kind)) {
    throw fail('OPERATION_CONFLICT', 'Operation ID already binds different inputs.');
  }
  return JSON.parse(existing.response_json);
}

function validateOperation(input) {
  if (!validAccount(input) || !validId(input.operationId) || !amount(input.amount)
    || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw fail('OPERATION_INVALID', 'Valid account, operation, amount and version are required.');
  }
}

async function transfer(input) {
  validateOperation(input);
  return serialized(async () => {
    const prior = await priorOperation(input, 'transfer');
    if (prior) return prior;
    const row = await accountRow(input);
    const ledger = await get('SELECT * FROM ledger WHERE id=1');
    if (!row || row.version !== input.expectedVersion) throw fail('VERSION_CONFLICT', 'Account version changed.');
    if (ledger.reserve < input.amount || row.balance + input.amount > row.capacity) {
      throw fail('QUOTA_DENIED', 'Reserve or account capacity insufficient.');
    }
    await run('UPDATE accounts SET balance=balance+?,version=version+1 WHERE tenant_id=? AND mission_id=? AND agent_id=?',
      [input.amount, ...account(input)]);
    await run('UPDATE ledger SET reserve=reserve-?,version=version+1 WHERE id=1', [input.amount]);
    const response = sign({ schema: 'genos.external-credit-receipt/v1', kind: 'external_refill',
      providerId: 'controlled-credit-provider', operationId: input.operationId,
      tenantId: input.tenantId, missionId: input.missionId, agentId: input.agentId,
      unit: 'execution_credit', amount: input.amount, before: row.balance,
      after: row.balance + input.amount, reserveBefore: ledger.reserve,
      reserveAfter: ledger.reserve - input.amount, beforeVersion: row.version,
      afterVersion: row.version + 1, issuedAt: new Date().toISOString() });
    await run('INSERT INTO operations VALUES (?,?,?)',
      [input.operationId, requestHash(input, 'transfer'), JSON.stringify(response)]);
    return response;
  });
}

async function spend(input) {
  validateOperation(input);
  return serialized(async () => {
    const prior = await priorOperation(input, 'spend');
    if (prior) return prior;
    const row = await accountRow(input);
    const ledger = await get('SELECT * FROM ledger WHERE id=1');
    if (!row || row.version !== input.expectedVersion) throw fail('VERSION_CONFLICT', 'Account version changed.');
    if (row.balance < input.amount) throw fail('QUOTA_DENIED', 'Balance insufficient.');
    await run('UPDATE accounts SET balance=balance-?,version=version+1 WHERE tenant_id=? AND mission_id=? AND agent_id=?',
      [input.amount, ...account(input)]);
    await run('UPDATE ledger SET spent=spent+?,version=version+1 WHERE id=1', [input.amount]);
    const response = sign({ schema: 'genos.external-credit-receipt/v1', kind: 'external_spend',
      providerId: 'controlled-credit-provider', operationId: input.operationId,
      tenantId: input.tenantId, missionId: input.missionId, agentId: input.agentId,
      unit: 'execution_credit', amount: input.amount, before: row.balance,
      after: row.balance - input.amount, beforeVersion: row.version,
      afterVersion: row.version + 1, issuedAt: new Date().toISOString() });
    await run('INSERT INTO operations VALUES (?,?,?)',
      [input.operationId, requestHash(input, 'spend'), JSON.stringify(response)]);
    return response;
  });
}

async function ledger() {
  const state = await get('SELECT * FROM ledger WHERE id=1');
  const accounts = await all('SELECT tenant_id,mission_id,agent_id,capacity,balance,version FROM accounts ORDER BY tenant_id,mission_id,agent_id');
  const total = accounts.reduce((sum, item) => sum + item.balance, 0);
  return { ...state, accounts, conserved: state.reserve + total + state.spent === state.initial };
}

async function operation(input) {
  const row = await get('SELECT response_json FROM operations WHERE operation_id=?', [input.operationId]);
  if (!row) throw fail('OPERATION_NOT_FOUND', 'Operation does not exist.');
  return JSON.parse(row.response_json);
}

const ROUTES = Object.freeze({
  'POST /accounts': seed, 'POST /transfer': transfer, 'POST /spend': spend,
  'GET /balance': observation, 'GET /operation': operation, 'GET /ledger': ledger
});

function dropTransferResponse(req, body) {
  if (!dropTransferOnce || req.method !== 'POST' || req.url !== '/transfer') return false;
  dropTransferOnce = false;
  fs.writeFileSync(dbPath + '.dropped-response', body.operationId);
  req.socket.destroy();
  return true;
}

async function route(req, body) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const input = req.method === 'GET' ? Object.fromEntries(url.searchParams) : body;
  const handler = ROUTES[req.method + ' ' + url.pathname];
  if (!handler) throw fail('ROUTE_NOT_FOUND', 'Unknown provider route.');
  return handler(input);
}

async function handle(req, res) {
  const supplied = String(req.headers['x-provider-token'] || '');
  const a = Buffer.from(supplied);
  const b = Buffer.from(token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.writeHead(403).end(JSON.stringify({ code: 'PROVIDER_FORBIDDEN' }));
    return;
  }
  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 65536) throw fail('BODY_TOO_LARGE', 'Request body too large.');
    }
    const body = raw ? JSON.parse(raw) : {};
    const result = await route(req, body);
    if (dropTransferResponse(req, body)) return;
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(409, { 'content-type': 'application/json' })
      .end(JSON.stringify({ code: error.code || 'PROVIDER_ERROR', error: error.message }));
  }
}

initialize().then(() => {
  const server = http.createServer((req, res) => { handle(req, res); });
  server.listen(0, '127.0.0.1', () => {
    process.stdout.write(JSON.stringify({ port: server.address().port, pid: process.pid }) + '\n');
  });
  process.on('SIGTERM', () => server.close(() => db.close()));
}).catch((error) => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
