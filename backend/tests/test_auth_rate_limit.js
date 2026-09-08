const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const original = dbModule.getDatabase;
dbModule.getDatabase = async () => ({ get: async () => null, run: async () => ({ changes: 0 }) });
const auth = require('../src/controllers/authController');
const response = () => ({ code: 200, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
(async () => {
  let limited = false;
  for (let i = 0; i < 25; i++) { const res = response(); await auth.verifyToken({ ip: 'rate-test', headers: {}, body: { token: `bad-${i}` } }, res); if (res.code === 429) limited = true; }
  assert.equal(limited, true);
  console.log('Auth verification rate-limit checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { dbModule.getDatabase = original; });
