'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const output = process.env.GENOS_REGULATION_OUTPUT_DIR
  || path.resolve(__dirname, '../../../../regulation-probe-results');
fs.mkdirSync(output, { recursive: true });
const root = fs.mkdtempSync(path.join(output, 'external-credit-'));
const keys = crypto.generateKeyPairSync('ed25519');
const privatePath = path.join(root, 'provider-private.pem');
const publicPath = path.join(root, 'provider-public.pem');
fs.writeFileSync(privatePath, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }));
fs.writeFileSync(publicPath, keys.publicKey.export({ type: 'spki', format: 'pem' }));
const token = crypto.randomBytes(32).toString('hex');
const dbPath = path.join(root, 'provider.db');
const providerFile = path.resolve(__dirname, '../fixtures/externalCreditProvider.cjs');
const account = { tenantId: 'tenant-a', missionId: 'mission-a', agentId: 'worker-a' };
let child;

function startProvider() {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, [providerFile], { cwd: root, windowsHide: true,
      env: { ...process.env, GENOS_CREDIT_PROVIDER_DB: dbPath,
        GENOS_CREDIT_PROVIDER_KEY_PATH: privatePath, GENOS_CREDIT_PROVIDER_TOKEN: token,
        GENOS_CREDIT_PROVIDER_INITIAL: '1000' } });
    let buffer = '';
    let errors = '';
    child.stderr.on('data', (chunk) => { errors += chunk.toString(); });
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const line = buffer.split('\n')[0];
      if (!line.endsWith('}')) return;
      try { resolve(JSON.parse(line).port); }
      catch (error) { reject(error); }
    });
    child.once('exit', (code) => reject(new Error(`Provider exited ${code}: ${errors}`)));
    setTimeout(() => reject(new Error(`Provider startup timed out: ${errors}`)), 10000).unref();
  });
}

async function stopProvider() {
  if (!child || child.exitCode !== null) return;
  const done = once(child, 'exit');
  child.kill();
  await done;
}

async function call(route, body) {
  const response = await fetch(`${process.env.GENOS_EXTERNAL_CREDIT_URL}${route}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-provider-token': token, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const value = await response.json();
  return { status: response.status, value };
}

async function main() {
  let port = await startProvider();
  process.env.GENOS_EXTERNAL_CREDIT_URL = `http://127.0.0.1:${port}`;
  process.env.GENOS_EXTERNAL_CREDIT_TOKEN = token;
  process.env.GENOS_EXTERNAL_CREDIT_PUBLIC_KEY_PATH = publicPath;
  const adapter = require('../../src/services/regulation/externalCreditProviderService');
  try {
    assert.equal((await call('/accounts', { ...account, capacity: 10, balance: 2 })).status, 200);
    assert.equal((await adapter.balance(account)).balance, 2);
    const input = { ...account, operationId: 'transfer-1', amount: 5, expectedVersion: 0 };
    const registry = require('../../src/services/agents/workerExecutorRegistry');
    const kinds = require('../../src/services/agents/workerKindService');
    const method = { version: 1, methodId: 'replenish_external_quota', parameters: input };
    const lease = { action: 'replenish_external_quota', tenantId: input.tenantId,
      missionId: input.missionId, targetAgentId: input.agentId, operationId: input.operationId,
      maxAmount: input.amount, expectedVersion: input.expectedVersion,
      expiresAt: new Date(Date.now() + 60000).toISOString() };
    const mission = { agentId: 'helper-a', workerKind: 'recovery_worker',
      orchestratorAgentId: 'parent-a', workspaceRoot: root, prompt: 'Replenish measured credit',
      methodContract: method, externalCreditLease: lease };
    mission.workerContract = kinds.buildWorkerContract('recovery_worker', mission);
    const native = await registry.executeNativeWorker('recovery_worker', method,
      { mission, deadline: Date.now() + 30000 });
    assert.equal(native.evidenceReport.outcome, 'success');
    const first = { receipt: native.output.creditReceipt,
      observation: native.output.creditObservation };
    assert.equal(adapter.checkObservation(first.observation, input).balance, 7);
    assert.equal(first.receipt.statement.before, 2);
    const duplicate = await adapter.transfer(input);
    assert.deepEqual(duplicate.receipt, first.receipt);
    assert.equal((await adapter.ledger()).reserve, 993);
    const tampered = structuredClone(first.receipt);
    tampered.statement.after = 99;
    assert.throws(() => adapter.verify(tampered, 'genos.external-credit-receipt/v1'),
      { code: 'EXTERNAL_CREDIT_PROOF_INVALID' });
    assert.throws(() => adapter.checkReceipt(first.receipt,
      { ...input, agentId: 'other-worker' }), { code: 'EXTERNAL_CREDIT_RECEIPT_INVALID' });
    const spent = await call('/spend', { ...account, operationId: 'spend-1', amount: 3, expectedVersion: 1 });
    assert.equal(spent.status, 200);
    assert.equal(adapter.verify(spent.value, 'genos.external-credit-receipt/v1').after, 4);
    const racing = await Promise.all([
      call('/transfer', { ...account, operationId: 'race-a', amount: 2, expectedVersion: 2 }),
      call('/transfer', { ...account, operationId: 'race-b', amount: 2, expectedVersion: 2 })
    ]);
    assert.deepEqual(racing.map((item) => item.status).sort(), [200, 409]);
    const ledger = await adapter.ledger();
    assert.equal(ledger.conserved, true);
    assert.equal(ledger.reserve + ledger.accounts.reduce((sum, row) => sum + row.balance, 0)
      + ledger.spent, ledger.initial);
    assert.equal((await adapter.balance(account)).balance, 6);
    await stopProvider();
    port = await startProvider();
    process.env.GENOS_EXTERNAL_CREDIT_URL = `http://127.0.0.1:${port}`;
    assert.equal((await adapter.balance(account)).balance, 6);
    assert.equal((await adapter.ledger()).conserved, true);
    assert.equal((await adapter.operation(input)).operationId, input.operationId);
    await stopProvider();
    await assert.rejects(adapter.balance(account), { code: 'EXTERNAL_CREDIT_UNAVAILABLE' });
    process.stdout.write(JSON.stringify({ schema: 'genos.external-credit-probe/v1',
      output: root, conserved: true, idempotent: true, restart: true, concurrent: true }) + '\n');
  } finally {
    await stopProvider();
  }
}

main().catch((error) => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
