'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const engine = require('../src/services/iamPolicyEngine');
const tlsConfig = require('../src/services/tlsConfig');
const vault = require('../src/services/secretVault');
const telemetry = require('../src/services/telemetryObserver');
const { migrateAdvancedIam } = require('../src/db/migrations/migrateAdvancedIam');

function sampleContext(role = 'operator') {
  return {
    principal: { keyId: 'key-1', role, permissions: ['read'], authMethod: 'access_key' },
    action: 'workspace:write',
    resource: { type: '/api/workspaces', organizationId: 'org-1', projectId: 'project-1' },
    request: { method: 'POST', path: '/api/workspaces' },
    environment: { hour: 12, weekday: 2 }
  };
}

function testPolicyDecisions() {
  const allowPolicy = engine.validatePolicy({
    effect: 'allow', actions: ['workspace:write'], subjects: { roles: ['operator'] },
    resources: { projectIds: ['project-1'] }, all: [{ attribute: 'request.method', operator: 'equals', value: 'POST' }]
  });
  const scoped = { ...allowPolicy, organizationId: 'org-1', projectId: 'project-1' };
  assert.equal(engine.evaluatePolicies([scoped], sampleContext(), false).allowed, true);
  const deny = { ...scoped, effect: 'deny', all: [] };
  assert.equal(engine.evaluatePolicies([scoped, deny], sampleContext(), true).allowed, false);
  assert.equal(engine.evaluatePolicies([scoped], sampleContext('viewer'), true).allowed, false);
  assert.equal(engine.evaluatePolicies([], sampleContext(), true).source, 'rbac');
  assert.throws(() => engine.validatePolicy({ effect: 'allow', actions: ['*'], all: [{ attribute: 'constructor.constructor', operator: 'equals', value: 'x' }] }));
}

function preserveEnvironment(names, callback) {
  const prior = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try { callback(); } finally {
    for (const [name, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function testTlsFailClosed() {
  preserveEnvironment(['GENOS_HTTP_TLS_KEY', 'GENOS_HTTP_TLS_CERT', 'GENOS_HTTP_CLIENT_CA', 'GENOS_HTTP_MTLS_REQUIRED'], () => {
    delete process.env.GENOS_HTTP_TLS_KEY;
    delete process.env.GENOS_HTTP_TLS_CERT;
    delete process.env.GENOS_HTTP_CLIENT_CA;
    process.env.GENOS_HTTP_MTLS_REQUIRED = '1';
    assert.throws(() => tlsConfig.readTransportTlsConfig({ keyEnv: 'GENOS_HTTP_TLS_KEY', certEnv: 'GENOS_HTTP_TLS_CERT', caEnv: 'GENOS_HTTP_CLIENT_CA', requiredEnv: 'GENOS_HTTP_MTLS_REQUIRED' }), /requires a server key/);
  });
  let argumentsSeen;
  tlsConfig.grpcServerCredentials({ ServerCredentials: { createSsl: (...args) => { argumentsSeen = args; return 'mtls'; }, createInsecure: () => 'insecure' } }, {
    pair: { private_key: Buffer.from('key'), cert_chain: Buffer.from('cert') }, clientCa: Buffer.from('ca'), requireClientCertificate: true
  });
  assert.equal(argumentsSeen[2], true);
  assert.ok(argumentsSeen[0].equals(Buffer.from('ca')));
}

async function testExternalVaultAdapter() {
  const priorFetch = global.fetch;
  const priorEmitEvent = telemetry.emitEvent;
  const priorEnv = { ...process.env };
  const calls = [];
  const policyTraces = [];
  process.env.GENOS_SECRETS_PROVIDER = 'hashicorp-vault';
  process.env.GENOS_VAULT_ADDR = 'https://vault.example.test';
  process.env.GENOS_VAULT_TOKEN = 'vault-test-token';
  process.env.GENOS_VAULT_KV_MOUNT = 'secret';
  telemetry.emitEvent = (event) => policyTraces.push(event);
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, status: 200, json: async () => ({ data: { data: { value: 'external-value' } } }) };
  };
  try {
    assert.equal(vault.getProvider(), 'hashicorp-vault');
    await vault.writeExternalSecret('org-1/project-1/credential', 'external-value');
    assert.equal(await vault.readExternalSecret('org-1/project-1/credential'), 'external-value');
    assert.equal(calls[0].options.method, 'PUT');
    assert.equal(JSON.parse(calls[0].options.body).data.value, 'external-value');
    assert.equal(calls[1].options.headers['X-Vault-Token'], 'vault-test-token');
    const db = await open({ filename: ':memory:', driver: sqlite3.Database });
    await migrateAdvancedIam(db);
    const policy = engine.validatePolicy({ effect: 'allow', actions: ['workspace:write'], subjects: { roles: ['operator'] } });
    await db.run('INSERT INTO iam_policies (id, name, enabled, policy_json) VALUES (?, ?, 1, ?)', 'policy-1', 'stored test policy', JSON.stringify(policy));
    const decision = await engine.authorize({ db, context: sampleContext(), fallbackAllowed: false });
    assert.equal(decision.allowed, true, 'stored tenant-wide policy is evaluated by the runtime');
    assert.equal(policyTraces[0].eventType, 'IAM_POLICY_EVALUATED');
    await db.run('INSERT INTO secrets (name, organization_id, project_id, provider, external_ref) VALUES (?, ?, ?, ?, ?)',
      'credential', 'org-1', 'project-1', 'hashicorp-vault', 'org-1/project-1/credential');
    assert.equal(await vault.resolveStoredSecret(db, { name: 'credential', organizationId: 'org-1', projectId: 'project-1' }), 'external-value');
    await db.close();
    process.env.GENOS_VAULT_ADDR = 'http://vault.example.test';
    await assert.rejects(() => vault.writeExternalSecret('x', 'y'), /Vault must use HTTPS/);
  } finally {
    global.fetch = priorFetch;
    telemetry.emitEvent = priorEmitEvent;
    for (const key of Object.keys(process.env)) if (!(key in priorEnv)) delete process.env[key];
    Object.assign(process.env, priorEnv);
  }
}

async function main() {
  testPolicyDecisions();
  testTlsFailClosed();
  await testExternalVaultAdapter();
  console.log('Advanced IAM policy, mTLS configuration and external Vault checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
