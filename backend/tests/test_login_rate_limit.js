const assert = require('node:assert/strict');

const dbModule = require('../src/db');
const original = dbModule.getDatabase;
dbModule.getDatabase = async () => ({ get: async () => null, run: async () => ({ changes: 0 }) });

const auth = require('../src/controllers/authController');

function response() {
  return {
    code: 200,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

(async () => {
  let limited = false;
  for (let i = 0; i < 12; i += 1) {
    const res = response();
    await auth.loginWithPassword({ ip: 'login-rate-test', headers: {}, body: { username: 'nobody', password: `bad-${i}` } }, res);
    if (res.code === 429) limited = true;
  }
  assert.equal(limited, true, 'password login must be rate limited');
  console.log('Login rate-limit checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  dbModule.getDatabase = original;
});
