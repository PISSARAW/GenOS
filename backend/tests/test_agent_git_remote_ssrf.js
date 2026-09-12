const assert = require('node:assert/strict');

const dbModule = require('../src/db');
const original = dbModule.getDatabase;
dbModule.getDatabase = async () => ({
  get: async () => null,
  all: async () => [],
  run: async () => ({ changes: 0 })
});

let fetchCalled = false;
const originalFetch = global.fetch;
global.fetch = async () => { fetchCalled = true; return { ok: true, json: async () => ({}) }; };

const git = require('../src/services/agentGitService');

(async () => {
  for (const remoteUrl of ['http://127.0.0.1:8085', 'http://localhost:4000', 'http://169.254.169.254', 'http://10.0.0.5']) {
    fetchCalled = false;
    await assert.rejects(
      () => git.fetch({ body: { remoteUrl }, tenant: null, user: {} }),
      /blocked|loopback|private|metadata/i,
      `remote URL ${remoteUrl} must be rejected`
    );
    assert.equal(fetchCalled, false, `fetch must not run for ${remoteUrl}`);
  }

  process.env.GENOS_AGENT_GIT_ALLOW_PRIVATE_REMOTES = '1';
  let ran = false;
  global.fetch = async () => { ran = true; return { ok: true, json: async () => ({ ok: true }) }; };
  const result = await git.fetch({ body: { remoteUrl: 'http://127.0.0.1:8085' }, tenant: null, user: {} });
  assert.equal(ran, true);
  assert.equal(result.success, true);
  delete process.env.GENOS_AGENT_GIT_ALLOW_PRIVATE_REMOTES;

  console.log('Agent Git remote SSRF guard checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  dbModule.getDatabase = original;
  global.fetch = originalFetch;
  delete process.env.GENOS_AGENT_GIT_ALLOW_PRIVATE_REMOTES;
});
