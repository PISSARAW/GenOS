const assert = require('node:assert/strict');
const { csrfCheck } = require('../src/middleware/security');

function response() {
  return {
    code: 200,
    body: null,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function request(method, headers) {
  return { method, headers, path: '/api/workspaces', ip: '127.0.0.1' };
}

async function run(req) {
  const res = response();
  let nextCalled = false;
  await csrfCheck(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

(async () => {
  const browser = await run(request('POST', { origin: 'http://evil.example', 'x-csrf-token': 'attacker-token-value' }));
  assert.equal(browser.res.code, 403);
  assert.equal(browser.res.body.error.code, 'CSRF_VALIDATION_FAILED');
  assert.equal(browser.nextCalled, false);

  process.env.NODE_ENV = 'test';
  const testEnv = await run(request('POST', { origin: 'http://evil.example', 'x-csrf-token': 'attacker-token-value' }));
  assert.equal(testEnv.res.code, 403, 'NODE_ENV=test must not bypass CSRF');

  const headerClient = await run(request('POST', { 'x-access-key': '' }));
  assert.equal(headerClient.nextCalled, true, 'non-browser requests fall through to authentication');

  delete process.env.NODE_ENV;
  console.log('CSRF enforcement checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
