'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_SKIP_BOOT_DB_BACKUP = '1';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = require('node:crypto').randomBytes(32).toString('hex');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { fixtures } = require('../helpers/nativeWorkerFixtures');

const output = process.env.GENOS_REGULATION_OUTPUT_DIR
  || path.resolve(__dirname, '../../../../regulation-probe-results');
let providerProcess = null;
const providerFile = path.resolve(__dirname, '../fixtures/externalCreditProvider.cjs');

async function startProvider(root) {
  const keys = crypto.generateKeyPairSync('ed25519');
  const privateKeyPath = path.join(root, 'provider-private.pem');
  const publicKeyPath = path.join(root, 'provider-public.pem');
  await fs.writeFile(privateKeyPath, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  await fs.writeFile(publicKeyPath, keys.publicKey.export({ type: 'spki', format: 'pem' }));
  const token = crypto.randomBytes(32).toString('hex');
  providerProcess = spawn(process.execPath, [providerFile], { cwd: root, windowsHide: true,
    env: { ...process.env, GENOS_CREDIT_PROVIDER_DB: path.join(root, 'provider.db'),
      GENOS_CREDIT_PROVIDER_KEY_PATH: privateKeyPath, GENOS_CREDIT_PROVIDER_TOKEN: token,
      GENOS_CREDIT_PROVIDER_INITIAL: '1000' } });
  let pending = '';
  let errors = '';
  providerProcess.stderr.on('data', chunk => { errors += chunk.toString(); });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Provider startup timed out: ${errors}`)), 10000);
    providerProcess.stdout.on('data', chunk => {
      pending += chunk.toString();
      const line = pending.split(/\r?\n/)[0];
      if (!line.endsWith('}')) return;
      clearTimeout(timer);
      try { resolve(JSON.parse(line).port); } catch (error) { reject(error); }
    });
    providerProcess.once('exit', code => reject(new Error(`Provider exited ${code}: ${errors}`)));
  });
  return { url: `http://127.0.0.1:${port}`, token, publicKeyPath, privateKeyPath };
}

async function stopProvider() {
  if (!providerProcess || providerProcess.exitCode !== null) return;
  const done = once(providerProcess, 'exit');
  providerProcess.kill();
  await done;
}

async function seedProviderAccount(provider, account) {
  const response = await fetch(`${provider.url}/accounts`, { method: 'POST',
    headers: { 'x-provider-token': provider.token, 'content-type': 'application/json' },
    body: JSON.stringify({ ...account, balance: 2 }) });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result;
}

async function readApoptosisTelemetry(file) {
  const content = await fs.readFile(file, 'utf8').catch(() => '');
  return content.split(/\r?\n/).filter(Boolean).flatMap(line => {
    try {
      const event = JSON.parse(line);
      return /HALLUCINATION|APOPTOSIS/.test(event.eventType || '')
        ? [{ eventType: event.eventType, detail: event.detail, payload: event.payload }] : [];
    } catch (_) { return []; }
  });
}

async function seedScopedWorkspace(workspace, environment) {
  process.env.GENOS_DB_PATH = environment.GENOS_DB_PATH;
  process.env.GENOS_ADMIN_PASSWORD = environment.GENOS_ADMIN_PASSWORD;
  process.env.GENOS_ADMIN_TOKEN = environment.GENOS_ADMIN_TOKEN;
  process.env.GENOS_STUDIO_ROOT = environment.GENOS_STUDIO_ROOT;
  process.env.GENOS_CAPSULE_ROOT = environment.GENOS_CAPSULE_ROOT;
  process.env.GENOS_WORKSPACES_ROOT = environment.GENOS_WORKSPACES_ROOT;
  process.env.GENOS_WORKSPACE_ROOT = workspace;
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  const { getDatabase, closeDatabase } = require('../../src/db');
  const db = await getDatabase(environment.GENOS_DB_PATH);
  try {
    await db.run("INSERT INTO organizations (id,name) VALUES ('regulation-cli-org','Regulation CLI proof')");
    await db.run("INSERT INTO projects (id,organization_id,name) VALUES ('regulation-cli-project','regulation-cli-org','Native missions')");
    await db.run(`INSERT INTO workspaces (id,name,path,organization_id,project_id)
      VALUES ('ws-local','Regulation CLI proof',?,'regulation-cli-org','regulation-cli-project')`, workspace);
  } finally { await closeDatabase(); }
}


async function auditTarget(context, index, item) {
  const { db, plan, exitCode, provider } = context;
      const targetAssignment = plan.assignments.find(candidate => candidate.label === `native-objective-${index + 1}`);
      const recoveryAssignment = plan.assignments.find(candidate => candidate.label === `native-objective-${index + 1}-recovery`);
      assert.ok(targetAssignment && recoveryAssignment, `native plan omitted ${item.kind} or its recovery worker`);
      assert.equal(targetAssignment.workerId, item.agentId, `provider account was not bound to planned ${item.kind} identity`);
      const workerRun = await db.get('SELECT id,status,guardrail_reason FROM strategy_execution_runs WHERE agent_id=? ORDER BY created_at DESC LIMIT 1', item.agentId);
      assert.ok(workerRun, `planned real ${item.kind} worker did not start a run (CLI exit ${exitCode})`);
      assert.equal(workerRun.status, 'completed', `real ${item.kind} worker did not complete`);
      const targetAuthority = await require('../../src/services/missionEnvelopeAuthority').read(db, workerRun.id);
      assert.ok(targetAuthority, `${item.kind} run has no sealed execution authority`);
      const completion = await db.get(`SELECT payload_json FROM telemetry_events
        WHERE agent_id=? AND event_type='AGENT_COMPLETED' ORDER BY rowid DESC LIMIT 20`, item.agentId);
      assert.ok(completion && JSON.parse(completion.payload_json).executionRunId === workerRun.id,
        `${item.kind} has no durable completion event for its run`);
      const helper = await db.get('SELECT id,status FROM agents WHERE id=?', recoveryAssignment.workerId);
      const completedHelperRun = await db.get("SELECT id,status FROM strategy_execution_runs WHERE agent_id=? AND status='completed' ORDER BY created_at DESC LIMIT 1", recoveryAssignment.workerId);
      assert.ok(helper && completedHelperRun, `${item.kind} recovery worker has no completed run`);
      const helperCompletion = await db.get(`SELECT payload_json FROM telemetry_events
        WHERE agent_id=? AND event_type='AGENT_COMPLETED' ORDER BY rowid DESC LIMIT 20`, helper.id);
      assert.ok(helperCompletion && JSON.parse(helperCompletion.payload_json).executionRunId === completedHelperRun.id,
        `${item.kind} recovery has no durable completion event`);
      const targetRow = await db.get('SELECT metadata_json FROM agents WHERE id=?', item.agentId);
      const linkedRecovery = JSON.parse(targetRow.metadata_json).workerContract.mission.regulatoryExternalRecovery;
      assert.deepEqual(linkedRecovery, { recoveryAgentId: helper.id, recoveryRunId: completedHelperRun.id,
        operationId: recoveryAssignment.methodContract.parameters.operationId }, `${item.kind} recovery link`);
      const creditRows = await db.all("SELECT operation_id,recovery_agent_id,recovery_run_id FROM regulatory_external_recoveries WHERE agent_id=?", item.agentId);
      assert.equal(creditRows.length, 1, `${item.kind} supervisor did not persist verified external recovery`);
      assert.equal(creditRows[0].recovery_run_id, completedHelperRun.id, `${item.kind} recovery run provenance`);
      const regulatoryState = await require('../../src/services/regulation/regulatoryPersistenceService').sync(db, item.agentId);
      assert.equal(regulatoryState.energy, 0.7, `${item.kind} internal energy was not restored to the functional range`);
      assert.equal(require('../../src/services/regulation/regulatoryBridgeService').functional(
        require('../../src/services/regulation/regulatoryBridgeService').toSnapshot(item.agentId)), true,
      `${item.kind} remains outside its functional homeostasis range`);
      const helperAuthority = await require('../../src/services/missionEnvelopeAuthority').read(db, completedHelperRun.id);
      assert.ok(helperAuthority, `${item.kind} recovery run has no sealed authority`);
      const helperAttestation = await require('../../src/services/epistemic/nativeOracleJournal').read(db,
        { runId: completedHelperRun.id, agentId: helper.id, scope: helperAuthority.envelope.scope, kind: 'attestation' });
      assert.equal(helperAttestation?.value.accepted, true, `${item.kind} recovery lacks independent native oracle approval`);
      assert.equal(helperAttestation.value.costs.processes, 2, `${item.kind} recovery did not execute two verifiers`);
      const assembly = await require('../../src/services/aeisAssemblyStore').readAssembly(db, helperAttestation.value.assemblyId);
      const verifications = assembly.evaluation.assembly.verifications;
      assert.deepEqual(verifications.map(result => result.status), ['verified', 'verified'], `${item.kind} recovery verifiers`);
      assert.equal(new Set(verifications.map(result => result.executionEvidence[0].processId)).size, 2,
        `${item.kind} recovery verifiers were not independent processes`);
      assert.equal((await require('../../src/services/biologicalWorkerStore').receipt(db, completedHelperRun.id)).result.verified, true);
      const balance = await require('../../src/services/regulation/externalCreditProviderService').balance(item.account);
      assert.equal(balance.balance, 7, `${item.kind} external balance was not restored`);
  return { kind: item.kind, workerId: item.agentId, workerRunId: workerRun.id,
        recoveryWorkerId: helper.id, recoveryRunId: completedHelperRun.id, balance: balance.balance,
        regulatoryEnergy: regulatoryState.energy, independentVerifiers: helperAttestation.value.costs.processes,
    verifierStatuses: verifications.map(result => result.status) };
}

async function buildObjectives({ provider, workspace, missionId, orchestratorId }) {
  const nativeMethods = fixtures(workspace);
  const objectives = Object.entries(nativeMethods).map(([kind, methodContract], index) => {
    const digest = crypto.createHash('sha256')
      .update(`${missionId}\u0000${orchestratorId}\u0000${index + 1}\u0000${kind}`).digest('hex').slice(0, 32);
    const agentId = `worker_${orchestratorId}_${index + 1}_${digest}`;
    return { kind, agentId, account: { tenantId: 'regulation-cli-tenant', missionId, agentId, capacity: 10 },
      objective: { goal: `Demonstrate regulated native ${kind} work`,
        successCriteria: [`Run the real ${kind} worker after independently verified external credit recovery.`],
        methodContract,
        ...(kind === 'symbiotic_worker' ? { hostContractId: 'host-native',
          hostCapabilities: ['deterministic_procedure'] } : {}),
        ...(kind === 'recovery_worker' ? { recoveryLease: { action: 'restore_checkpoint', path: 'state.txt' } } : {}),
        ...(kind === 'sub_orchestrator' ? { delegatedTokenLimit: 1000 } : {}),
        externalCredit: { tenantId: 'regulation-cli-tenant', capacity: 10, recoveryAmount: 5 } } };
  });
  for (const item of objectives) await seedProviderAccount(provider, item.account);
  return objectives;
}

async function auditMatrix(context) {
  const { root, environment, objectives, provider, missionId, exitCode, stdout } = context;
  const { getDatabase, closeDatabase } = require('../../src/db');
  const db = await getDatabase(environment.GENOS_DB_PATH);
  try {
    const parent = await db.get("SELECT id,status FROM agents WHERE execution_mode='orchestrator' ORDER BY created_at DESC LIMIT 1");
    const parentRun = await db.get('SELECT id,status,guardrail_reason FROM strategy_execution_runs WHERE agent_id=? ORDER BY created_at DESC LIMIT 1', parent.id);
    const planEvent = await db.get("SELECT payload_json FROM telemetry_events WHERE agent_id=? AND event_type='NATIVE_MISSION_PLAN_SELECTED' ORDER BY id DESC LIMIT 1", parent.id);
    assert.ok(planEvent, 'genos_orchestrate did not select a native objective plan');
    const plan = JSON.parse(planEvent.payload_json);
    assert.equal(plan.requested, 19);
    assert.equal(plan.selected, 38);
    assert.equal(plan.assignments.filter(isExternalRecoveryAssignment).length, 19);
    const targetResults = [];
    for (const [index, item] of objectives.entries()) {
      targetResults.push(await auditTarget({ db, plan, exitCode, provider }, index, item));
    }
    const ledger = await require('../../src/services/regulation/externalCreditProviderService').ledger();
    assert.equal(ledger.conserved, true, 'external provider ledger does not conserve credits');
    const mission = await db.get('SELECT status FROM missions WHERE mission_id=?', missionId);
    const apoptosisTelemetry = await readApoptosisTelemetry(environment.GENOS_MCP_TELEMETRY_FILE);
    const cliResult = JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
    const complete = missionCompleted({ exitCode, parent, parentRun, mission });
    const audit = { schema: 'genos.native-orchestrate-matrix/v1', result: complete ? 'complete' : 'incomplete',
      cliExitCode: exitCode, parentId: parent.id, parentStatus: parent.status, parentRunId: parentRun.id,
      parentRunStatus: parentRun.status, parentGuardrail: parentRun.guardrail_reason ?? null, missionStatus: mission?.status ?? null,
      planDigest: plan.digest, requestedKinds: plan.requested, selected: plan.selected, workerResults: targetResults,
      providerLedgerConserved: ledger.conserved,
      missionHomeostasisSatisfied: cliResult.continuity?.homeostasisSatisfied === true,
      completionGateAllowed: cliResult.completionGate?.allowed === true, cliVerdict: cliResult.verdict,
      coverageVerdict: cliResult.coverage?.verdict || null,
      requiredTools: cliResult.coverage?.orchestration?.requiredTools ?? [],
      missingRequiredTools: cliResult.coverage?.orchestration?.missingRequiredTools ?? [], apoptosisTelemetry, outputRoot: root };
    await fs.writeFile(path.join(root, 'audit.json'), JSON.stringify(audit, null, 2) + '\n');
    process.stdout.write(JSON.stringify(audit) + '\n');
    assert.equal(parent.status, 'completed', 'the real orchestrator did not finish');
    assert.equal(parentRun.status, 'completed', 'the orchestrator execution run did not finish');
    assert.equal(targetResults.length, 19, 'not all native worker kinds completed');
    assert.equal(cliResult.continuity?.homeostasisSatisfied, true, 'mission homeostasis did not pass');
    assert.equal(cliResult.completionGate?.allowed, true, 'the homeostasis completion gate did not pass');
    assert.ok(cliResult.coverage?.verdict, 'the CLI did not report its required orchestration coverage audit');
    assert.equal(cliResult.coverage.verdict, 'required-coverage-complete', 'the factual read-only plan did not execute every declared required tool');
    assert.deepEqual(cliResult.coverage.orchestration.missingRequiredTools, [], 'the factual read-only plan is missing durable tool receipts');
  } finally { await closeDatabase(); await stopProvider(); }
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  const root = await fs.mkdtemp(path.join(output, 'native-orchestrate-cli-'));
  const provider = await startProvider(root);
  process.env.GENOS_EXTERNAL_CREDIT_URL = provider.url;
  process.env.GENOS_EXTERNAL_CREDIT_TOKEN = provider.token;
  process.env.GENOS_EXTERNAL_CREDIT_PUBLIC_KEY_PATH = provider.publicKeyPath;
  const workspace = path.join(root, 'workspace');
  const environment = { ...process.env, GENOS_DB_PATH: path.join(root, 'genos.db'),
    GENOS_ADMIN_PASSWORD: crypto.randomBytes(24).toString('hex'),
    GENOS_ADMIN_TOKEN: crypto.randomBytes(24).toString('hex'),
    GENOS_STUDIO_ROOT: path.join(root, 'studio'),
    GENOS_CAPSULE_ROOT: path.join(root, 'capsules'),
    GENOS_WORKSPACES_ROOT: root,
    GENOS_WORKSPACE_ROOT: workspace,
    GENOS_MCP_TELEMETRY_FILE: path.join(root, 'telemetry.jsonl'),
    GENOS_DISABLE_WORKSPACE_GC: '1',
    GENOS_DISABLE_DOTENV: '1',
    GENOS_SKIP_BOOT_DB_BACKUP: '1',
    GENOS_EXTERNAL_CREDIT_URL: provider.url,
    GENOS_EXTERNAL_CREDIT_TOKEN: provider.token,
    GENOS_EXTERNAL_CREDIT_PUBLIC_KEY_PATH: provider.publicKeyPath,
    TEMP: path.join(root, 'temp'), TMP: path.join(root, 'temp'), TMPDIR: path.join(root, 'temp') };
  await fs.mkdir(environment.TEMP, { recursive: true });
  await fs.mkdir(workspace, { recursive: true });
  await seedScopedWorkspace(workspace, environment);
  const cli = path.resolve(__dirname, '../../bin/genos-orchestrate.cjs');
  const orchestratorId = 'regulation-cli-orchestrator';
  const missionId = 'regulation-cli-mission';
  const objectives = await buildObjectives({ provider, workspace, missionId, orchestratorId });
  await fs.writeFile(path.join(workspace, 'state.txt'), 'damaged');
  const request = { mission: 'Before changing provider or worker state, call genos_snapshot on the supplied workspace and genos_search_failures. Then use genos_orchestrate to plan and run one real GenOS worker of every native kind. Before each target dispatch, restore its depleted external credit from signed provider receipts, verify restoration independently, and complete the full native orchestration plan.',
    native_objectives: objectives.map(item => item.objective),
    workspaceId: 'ws-local', workspaceRoot: workspace, workspaceProvisioned: true,
    orchestratorId, missionId,
    evaluationMode: 'factual_read_only',
    executionPolicy: { workerFanoutLimit: 8 },
    background: false, autonomous_orchestration: true, executor: 'codex', timeoutMs: 600000,
    executionBudget: { tokens: 2000000, costUsd: 20, latencyMs: 600000,
      verification: { executions: 2, latencyMs: 60000 } } };
  const child = spawn(process.execPath, [cli, JSON.stringify(request)], {
    cwd: path.resolve(__dirname, '../../..'), env: environment, windowsHide: true });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve) => {
    const timer = setTimeout(() => child.kill(), 660000);
    child.on('exit', code => { clearTimeout(timer); resolve(code); });
  });
  await fs.writeFile(path.join(root, 'stdout.txt'), stdout);
  await fs.writeFile(path.join(root, 'stderr.txt'), stderr);
  await auditMatrix({ root, environment, objectives, provider, missionId, exitCode, stdout });

}

main().catch(failure => { process.stderr.write(failure.stack + '\n'); process.exitCode = 1; });

function isExternalRecoveryAssignment(item) {
  return item.workerKind === 'recovery_worker' && item.methodContract.methodId === 'replenish_external_quota';
}

function missionCompleted({ exitCode, parent, parentRun, mission }) {
  return exitCode === 0 && parent.status === 'completed'
    && parentRun.status === 'completed' && mission?.status === 'completed';
}
