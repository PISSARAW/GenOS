'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const base = process.env.GENOS_REGULATION_OUTPUT_DIR
  || path.resolve(__dirname, '../../../../regulation-probe-results');
fs.mkdirSync(base, { recursive: true });
const root = fs.mkdtempSync(path.join(base, 'external-supervision-'));
const keys = crypto.generateKeyPairSync('ed25519');
const privatePath = path.join(root, 'private.pem');
const publicPath = path.join(root, 'public.pem');
fs.writeFileSync(privatePath, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }));
fs.writeFileSync(publicPath, keys.publicKey.export({ type: 'spki', format: 'pem' }));
const token = crypto.randomBytes(32).toString('hex');
process.env.GENOS_DB_PATH = path.join(root, 'genos.db');
process.env.GENOS_ADMIN_PASSWORD = crypto.randomBytes(24).toString('hex');
process.env.GENOS_ADMIN_TOKEN = crypto.randomBytes(24).toString('hex');
process.env.GENOS_EXTERNAL_CREDIT_TOKEN = token;
process.env.GENOS_EXTERNAL_CREDIT_PUBLIC_KEY_PATH = publicPath;

const { getDatabase, closeDatabase } = require('../../src/db');
const kinds = require('../../src/services/agents/workerKindService');
const { hashContract } = require('../../src/services/strategyContractService');
const { runDeterministicWorker } = require('../../src/services/agents/deterministicWorkerRuntime');
const { missionFor, fixtures, method } = require('../helpers/nativeWorkerFixtures');
const state = require('../../src/services/regulation/regulatoryStateService');
const bridge = require('../../src/services/regulation/regulatoryBridgeService');
const persistence = require('../../src/services/regulation/regulatoryPersistenceService');
const providerFile = path.resolve(__dirname, '../fixtures/externalCreditProvider.cjs');
const account = { tenantId: 'tenant-a', missionId: 'credit-mission', agentId: 'native-bounded_worker', capacity: 10 };
let provider;

function startProvider() {
  return new Promise((resolve, reject) => {
    provider = spawn(process.execPath, [providerFile], { cwd: root, windowsHide: true,
      env: { ...process.env, GENOS_CREDIT_PROVIDER_DB: path.join(root, 'provider.db'),
        GENOS_CREDIT_PROVIDER_KEY_PATH: privatePath, GENOS_CREDIT_PROVIDER_TOKEN: token,
        GENOS_CREDIT_PROVIDER_INITIAL: '1000' } });
    let line = '';
    let errors = '';
    provider.stderr.on('data', (chunk) => { errors += chunk.toString(); });
    provider.stdout.on('data', (chunk) => {
      line += chunk.toString();
      const first = line.split('\n')[0];
      if (!first.endsWith('}')) return;
      try { resolve(JSON.parse(first).port); } catch (error) { reject(error); }
    });
    provider.once('exit', (code) => reject(new Error(`Provider exited ${code}: ${errors}`)));
    setTimeout(() => reject(new Error(`Provider startup timed out: ${errors}`)), 10000).unref();
  });
}

async function stopProvider() {
  if (!provider || provider.exitCode !== null) return;
  const done = once(provider, 'exit');
  provider.kill();
  await done;
}

async function seedProvider() {
  const response = await fetch(`${process.env.GENOS_EXTERNAL_CREDIT_URL}/accounts`, {
    method: 'POST', headers: { 'x-provider-token': token, 'content-type': 'application/json' },
    body: JSON.stringify({ ...account, balance: 2 })
  });
  assert.equal(response.status, 200, await response.text());
}

async function initialize(db) {
  await db.run('INSERT INTO organizations (id,name) VALUES (?,?)', 'credit-org', 'Credit regulation');
  await db.run('INSERT INTO projects (id,organization_id,name) VALUES (?,?,?)',
    'credit-project', 'credit-org', 'Real external credit');
  await db.run('INSERT INTO workspaces (id,name,path,organization_id,project_id) VALUES (?,?,?,?,?)',
    'credit-ws', 'Credit workspace', root, 'credit-org', 'credit-project');
  await db.run("INSERT INTO agents (id,name,role,status,execution_mode,workspace_id) VALUES ('native-parent','native-parent','orchestrator','idle','orchestrator','credit-ws')");
  await db.run("INSERT INTO missions (mission_id,objective,status,orchestrator_agent_id) VALUES ('credit-mission','External credit regulation','active','native-parent')");
  await db.run("INSERT INTO mission_agents (mission_id,agent_id,role) VALUES ('credit-mission','native-parent','orchestrator')");
}

async function setup(db, mission, options) {
  const { runId, insertAgent = true } = options;
  const id = mission.agentId;
  const contract = { execution_pipeline: [], strategy_portfolio: [], promotion: {} };
  const contractId = `contract-${id}`;
  if (insertAgent) {
    await db.run("INSERT INTO agents (id,name,role,status,execution_mode,workspace_id,parent_agent_id,metadata_json) VALUES (?,?,?,'idle','worker','credit-ws','native-parent',?)",
      id, id, mission.workerKind, JSON.stringify({ workerKind: mission.workerKind, workerContract: mission.workerContract }));
    await db.run('INSERT INTO strategy_contracts (id,agent_id,workspace_id,version,primary_strategy,contract_hash,contract_json) VALUES (?,?,?,?,?,?,?)',
      contractId, id, 'credit-ws', 1, 'credit-probe', hashContract(contract), JSON.stringify(contract));
  } else {
    await db.run('UPDATE agents SET metadata_json=? WHERE id=?',
      JSON.stringify({ workerKind: mission.workerKind, workerContract: mission.workerContract }), id);
  }
  await db.run("INSERT INTO strategy_execution_runs (id,agent_id,contract_id,contract_version,status,budget_json,metrics_json) VALUES (?,?,?,1,'planned',?,?)",
    runId, id, contractId, JSON.stringify({ tokens: 0, deterministic: true, latencyMs: 300000, costUsd: 1 }),
    JSON.stringify({ tokens: 0, costUsd: 0, latencyMs: 0, events: 0 }));
}

function targetMission() {
  const mission = missionFor('bounded_worker', fixtures(root).bounded_worker, root);
  mission.missionId = account.missionId;
  mission.externalCredit = account;
  mission.workerContract = kinds.buildWorkerContract('bounded_worker', mission);
  return mission;
}

function helperMission() {
  const parameters = { tenantId: account.tenantId, missionId: account.missionId,
    agentId: account.agentId, operationId: 'credit-repair-1', amount: 5, expectedVersion: 0 };
  const helper = missionFor('recovery_worker', method('replenish_external_quota', parameters), root);
  helper.agentId = 'credit-helper-1';
  helper.externalCreditLease = { action: 'replenish_external_quota',
    tenantId: account.tenantId, missionId: account.missionId,
    targetAgentId: account.agentId, operationId: parameters.operationId,
    maxAmount: 5, expectedVersion: 0, expiresAt: new Date(Date.now() + 60000).toISOString() };
  helper.workerContract = kinds.buildWorkerContract('recovery_worker', helper);
  return helper;
}

async function main() {
  const port = await startProvider();
  process.env.GENOS_EXTERNAL_CREDIT_URL = `http://127.0.0.1:${port}`;
  let db;
  try {
    db = await getDatabase();
    await initialize(db);
    await seedProvider();
    const target = targetMission();
    await setup(db, target, { runId: 'target-without-proof' });
    const refused = await runDeterministicWorker(db, target, { id: 'target-without-proof' });
    assert.equal(refused.code, 'EXTERNAL_CREDIT_RECOVERY_REQUIRED');
    assert.equal(state.getState(target.agentId).energy, 0.2);
    const helper = helperMission();
    await setup(db, helper, { runId: 'helper-run' });
    const repaired = await runDeterministicWorker(db, helper, { id: 'helper-run' });
    assert.equal(repaired.started, true, repaired.error);
    target.regulatoryExternalRecovery = { recoveryAgentId: helper.agentId,
      recoveryRunId: 'helper-run', operationId: 'credit-repair-1' };
    target.workerContract = kinds.buildWorkerContract('bounded_worker', target);
    await setup(db, target, { runId: 'target-recovered', insertAgent: false });
    const completed = await runDeterministicWorker(db, target, { id: 'target-recovered' });
    assert.equal(completed.started, true, completed.error);
    const row = await db.get('SELECT * FROM regulatory_external_recoveries WHERE operation_id=?',
      'credit-repair-1');
    assert.equal(row.agent_id, target.agentId);
    assert.equal((await persistence.sync(db, target.agentId)).energy, 0.7);
    assert.equal(bridge.functional(bridge.toSnapshot(target.agentId)), true);
    const ledger = await require('../../src/services/regulation/externalCreditProviderService').ledger();
    assert.equal(ledger.conserved, true);
    const statuses = await db.all('SELECT id,status FROM strategy_execution_runs WHERE agent_id IN (?,?) ORDER BY id',
      target.agentId, helper.agentId);
    process.stdout.write(JSON.stringify({ schema: 'genos.external-supervision-probe/v1',
      output: root, statuses, recovery: row.operation_id, balance: 7, conserved: ledger.conserved }) + '\n');
  } finally {
    if (db) {
      await require('../../src/services/telemetryObserver').flush(10000);
      await closeDatabase();
    }
    await stopProvider();
  }
}

main().catch((error) => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
