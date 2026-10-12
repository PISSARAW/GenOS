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
const root = fs.mkdtempSync(path.join(output, 'external-matrix-'));
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
const bridge = require('../../src/services/regulation/regulatoryBridgeService');
const persistence = require('../../src/services/regulation/regulatoryPersistenceService');
const providerAdapter = require('../../src/services/regulation/externalCreditProviderService');
const providerFile = path.resolve(__dirname, '../fixtures/externalCreditProvider.cjs');
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

async function providerPost(route, input) {
  const response = await fetch(`${process.env.GENOS_EXTERNAL_CREDIT_URL}${route}`, {
    method: 'POST', headers: { 'x-provider-token': token, 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  const value = await response.json();
  assert.equal(response.status, 200, JSON.stringify(value));
  return value;
}

async function initialize(db) {
  await db.run('INSERT INTO organizations (id,name) VALUES (?,?)', 'matrix-org', 'External credit matrix');
  await db.run('INSERT INTO projects (id,organization_id,name) VALUES (?,?,?)',
    'matrix-project', 'matrix-org', 'Native regulation');
  await db.run('INSERT INTO workspaces (id,name,path,organization_id,project_id) VALUES (?,?,?,?,?)',
    'matrix-ws', 'Matrix workspace', root, 'matrix-org', 'matrix-project');
  await db.run("INSERT INTO agents (id,name,role,status,execution_mode,workspace_id) VALUES ('matrix-parent','matrix-parent','orchestrator','idle','orchestrator','matrix-ws')");
  await db.run("INSERT INTO missions (mission_id,objective,status,orchestrator_agent_id) VALUES ('matrix-mission','External regulation matrix','active','matrix-parent')");
  await db.run("INSERT INTO mission_agents (mission_id,agent_id,role) VALUES ('matrix-mission','matrix-parent','orchestrator')");
}

async function setup(db, mission, options) {
  const { runId, insertAgent = true } = options;
  const id = mission.agentId;
  const contract = { execution_pipeline: [], strategy_portfolio: [], promotion: {} };
  const contractId = `contract-${id}`;
  if (insertAgent) {
    await db.run("INSERT INTO agents (id,name,role,status,execution_mode,workspace_id,parent_agent_id,metadata_json) VALUES (?,?,?,'idle','worker','matrix-ws','matrix-parent',?)",
      id, id, mission.workerKind, JSON.stringify({ workerKind: mission.workerKind, workerContract: mission.workerContract }));
    await db.run('INSERT INTO strategy_contracts (id,agent_id,workspace_id,version,primary_strategy,contract_hash,contract_json) VALUES (?,?,?,?,?,?,?)',
      contractId, id, 'matrix-ws', 1, 'matrix-probe', hashContract(contract), JSON.stringify(contract));
    if (mission.workerKind === 'sub_orchestrator') {
      await db.run('INSERT INTO mission_agents (mission_id,agent_id,role) VALUES (?,?,?)',
        'matrix-mission', id, mission.workerKind);
    }
  } else {
    await db.run('UPDATE agents SET metadata_json=? WHERE id=?',
      JSON.stringify({ workerKind: mission.workerKind, workerContract: mission.workerContract }), id);
  }
  await db.run("INSERT INTO strategy_execution_runs (id,agent_id,contract_id,contract_version,status,budget_json,metrics_json) VALUES (?,?,?,1,'planned',?,?)",
    runId, id, contractId, JSON.stringify({ tokens: 0, deterministic: true, latencyMs: 300000, costUsd: 1 }),
    JSON.stringify({ tokens: 0, costUsd: 0, latencyMs: 0, events: 0 }));
}

function targetMission(kind, nativeMethod) {
  const target = missionFor(kind, nativeMethod, root);
  target.orchestratorAgentId = 'matrix-parent';
  target.missionId = 'matrix-mission';
  target.externalCredit = { tenantId: 'matrix-tenant', missionId: 'matrix-mission',
    agentId: target.agentId, capacity: 10 };
  target.workerContract = kinds.buildWorkerContract(kind, target);
  if (kind === 'sub_orchestrator') kinds.grantBoundedDelegation(target.workerContract);
  return target;
}

function helperMission(target, cycle, expectedVersion) {
  const operationId = `refill-${cycle}-${target.workerKind}`;
  const input = { ...target.externalCredit, operationId, amount: 5, expectedVersion };
  delete input.capacity;
  const helper = missionFor('recovery_worker', method('replenish_external_quota', input), root);
  helper.agentId = `repair-${cycle}-${target.workerKind}`;
  helper.orchestratorAgentId = 'matrix-parent';
  helper.missionId = target.missionId;
  helper.externalCreditLease = { action: 'replenish_external_quota',
    tenantId: input.tenantId, missionId: input.missionId, targetAgentId: input.agentId,
    operationId, maxAmount: 5, expectedVersion,
    expiresAt: new Date(Date.now() + 120000).toISOString() };
  helper.workerContract = kinds.buildWorkerContract('recovery_worker', helper);
  return helper;
}

async function runOne(db, target, cycle) {
  const account = target.externalCredit;
  if (cycle === 1) await providerPost('/accounts', { ...account, balance: 2 });
  else await providerPost('/spend', { ...account, operationId: `spend-${target.workerKind}`,
    amount: 5, expectedVersion: 1 });
  const expectedVersion = cycle === 1 ? 0 : 2;
  if (target.workerKind === 'recovery_worker') fs.writeFileSync(path.join(root, 'state.txt'), 'damaged');
  if (cycle === 1) {
    await setup(db, target, { runId: `refused-${target.workerKind}` });
    const refused = await runDeterministicWorker(db, target, { id: `refused-${target.workerKind}` });
    assert.equal(refused.code, 'EXTERNAL_CREDIT_RECOVERY_REQUIRED', target.workerKind);
  }
  const helper = helperMission(target, cycle, expectedVersion);
  const helperRunId = `helper-${cycle}-${target.workerKind}`;
  await setup(db, helper, { runId: helperRunId });
  const recovered = await runDeterministicWorker(db, helper, { id: helperRunId });
  assert.equal(recovered.started, true, `${target.workerKind} helper: ${recovered.code} ${recovered.error}`);
  target.regulatoryExternalRecovery = { recoveryAgentId: helper.agentId,
    recoveryRunId: helperRunId, operationId: helper.methodContract.parameters.operationId };
  target.workerContract = kinds.buildWorkerContract(target.workerKind, target);
  if (target.workerKind === 'sub_orchestrator') kinds.grantBoundedDelegation(target.workerContract);
  const runId = `target-${cycle}-${target.workerKind}`;
  await setup(db, target, { runId, insertAgent: false });
  const execution = await runDeterministicWorker(db, target, { id: runId });
  assert.equal(execution.started, true, `${target.workerKind}: ${execution.code} ${execution.error}`);
  const state = await persistence.sync(db, target.agentId);
  assert.equal(state.energy, 0.7, target.workerKind);
  assert.equal(bridge.functional(bridge.toSnapshot(target.agentId)), true, target.workerKind);
  const row = await db.get('SELECT operation_id FROM regulatory_external_recoveries WHERE operation_id=?',
    target.regulatoryExternalRecovery.operationId);
  assert.ok(row, target.workerKind);
  return { kind: target.workerKind, cycle, targetRunId: runId, helperRunId,
    operationId: row.operation_id, balance: (await providerAdapter.balance(account)).balance };
}

async function main() {
  const port = await startProvider();
  process.env.GENOS_EXTERNAL_CREDIT_URL = `http://127.0.0.1:${port}`;
  let db;
  const results = [];
  try {
    db = await getDatabase();
    await initialize(db);
    const methods = fixtures(root);
    const targets = Object.entries(methods).map(([kind, nativeMethod]) => targetMission(kind, nativeMethod));
    for (let cycle = 1; cycle <= 2; cycle += 1) {
      for (const target of targets) {
        results.push(await runOne(db, target, cycle));
        process.stdout.write(`${target.workerKind} cycle ${cycle}: verified\n`);
      }
    }
    const ledger = await providerAdapter.ledger();
    assert.equal(ledger.conserved, true);
    const report = { schema: 'genos.external-credit-matrix/v1', root,
      cases: results.length, kinds: targets.length, cycles: 2,
      conserved: ledger.conserved, results };
    fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
    process.stdout.write(JSON.stringify({ root, cases: report.cases, kinds: report.kinds,
      conserved: report.conserved }) + '\n');
  } catch (error) {
    fs.writeFileSync(path.join(root, 'partial.json'), JSON.stringify({ results,
      error: { message: error.message, stack: error.stack } }, null, 2));
    throw error;
  } finally {
    if (db) {
      await require('../../src/services/telemetryObserver').flush(10000);
      await closeDatabase();
    }
    await stopProvider();
  }
}

main().catch((error) => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });