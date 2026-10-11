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

const output = process.env.GENOS_REGULATION_OUTPUT_DIR
  || path.resolve(__dirname, '../../../../regulation-probe-results');

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

async function main() {
  await fs.mkdir(output, { recursive: true });
  const root = await fs.mkdtemp(path.join(output, 'native-orchestrate-cli-'));
  const workspace = path.resolve(__dirname, '../../..');
  const environment = { ...process.env, GENOS_DB_PATH: path.join(root, 'genos.db'),
    GENOS_ADMIN_PASSWORD: crypto.randomBytes(24).toString('hex'),
    GENOS_ADMIN_TOKEN: crypto.randomBytes(24).toString('hex'),
    GENOS_STUDIO_ROOT: path.join(root, 'studio'),
    GENOS_CAPSULE_ROOT: path.join(root, 'capsules'),
    GENOS_WORKSPACES_ROOT: root,
    GENOS_WORKSPACE_ROOT: workspace,
    GENOS_DISABLE_WORKSPACE_GC: '1',
    GENOS_DISABLE_DOTENV: '1',
    GENOS_SKIP_BOOT_DB_BACKUP: '1',
    TEMP: path.join(root, 'temp'), TMP: path.join(root, 'temp'), TMPDIR: path.join(root, 'temp') };
  await fs.mkdir(environment.TEMP, { recursive: true });
  await seedScopedWorkspace(workspace, environment);
  const cli = path.resolve(__dirname, '../../bin/genos-orchestrate.cjs');
  const methodContract = { version: 1, methodId: 'scan_literal', parameters: {
    sources: [{ sourceRef: 'corpus://cli/1', text: 'timeout=30' }], terms: ['timeout'] } };
  const request = { mission: 'Observe the declared timeout in the provided corpus and cite its source.',
    native_objectives: [{ goal: 'Observe timeout in the corpus',
      successCriteria: ['Return a sourced observation of timeout=30'], methodContract }],
    workspaceId: 'ws-local', workspaceRoot: workspace, workspaceProvisioned: true,
    background: false, autonomous_orchestration: true, executor: 'codex', timeoutMs: 180000,
    executionBudget: { tokens: 100000, costUsd: 5, latencyMs: 180000,
      verification: { executions: 2, latencyMs: 10000 } } };
  const child = spawn(process.execPath, [cli, JSON.stringify(request)], {
    cwd: path.resolve(__dirname, '../../..'), env: environment, windowsHide: true });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve) => {
    const timer = setTimeout(() => child.kill(), 210000);
    child.on('exit', code => { clearTimeout(timer); resolve(code); });
  });
  await fs.writeFile(path.join(root, 'stdout.txt'), stdout);
  await fs.writeFile(path.join(root, 'stderr.txt'), stderr);
  const { getDatabase, closeDatabase } = require('../../src/db');
  const db = await getDatabase(environment.GENOS_DB_PATH);
  try {
    const parent = await db.get("SELECT id,status FROM agents WHERE execution_mode='orchestrator' ORDER BY created_at DESC LIMIT 1");
    const parentRun = await db.get('SELECT id,status,guardrail_reason FROM strategy_execution_runs WHERE agent_id=? ORDER BY created_at DESC LIMIT 1', parent.id);
    const planEvent = await db.get("SELECT payload_json FROM telemetry_events WHERE agent_id=? AND event_type='NATIVE_MISSION_PLAN_SELECTED' ORDER BY id DESC LIMIT 1", parent.id);
    assert.ok(planEvent, 'genos_orchestrate did not select a native objective plan');
    const plan = JSON.parse(planEvent.payload_json);
    assert.equal(plan.selected, 1);
    const workerId = plan.assignments[0].workerId;
    const workerRun = await db.get('SELECT id,status,guardrail_reason FROM strategy_execution_runs WHERE agent_id=? ORDER BY created_at DESC LIMIT 1', workerId);
    assert.ok(workerRun, 'the planned real worker did not start a run');
    const authority = await require('../../src/services/missionEnvelopeAuthority').read(db, workerRun.id);
    assert.ok(authority, 'the worker run has no sealed execution authority');
    const requestForOracle = { runId: workerRun.id, agentId: workerId, scope: authority.envelope.scope };
    const attestation = await require('../../src/services/epistemic/nativeOracleJournal').read(db,
      { ...requestForOracle, kind: 'attestation' });
    assert.equal(attestation?.value.accepted, true, 'the real worker has no accepted native oracle attestation');
    assert.equal(attestation.value.costs.processes, 2);
    const assembly = await require('../../src/services/aeisAssemblyStore').readAssembly(db, attestation.value.assemblyId);
    const verifications = assembly.evaluation.assembly.verifications;
    assert.deepEqual(verifications.map(item => item.status), ['verified', 'verified']);
    assert.equal(new Set(verifications.map(item => item.executionEvidence[0].processId)).size, 2);
    assert.equal((await require('../../src/services/biologicalWorkerStore').receipt(db, workerRun.id)).result.verified, true);
    const mission = await db.get('SELECT status FROM missions WHERE mission_id=?', authority.envelope.missionId);
    const complete = exitCode === 0 && parent.status === 'completed' && parentRun.status === 'completed' && mission?.status === 'completed';
    const audit = { schema: 'genos.native-orchestrate-attempt/v1', result: complete ? 'complete' : 'incomplete',
      cliExitCode: exitCode, parentId: parent.id, parentStatus: parent.status, parentRunId: parentRun.id,
      parentRunStatus: parentRun.status, parentGuardrail: parentRun.guardrail_reason || null, missionStatus: mission?.status || null,
      planDigest: plan.digest, selected: plan.selected, workerId, workerRunId: workerRun.id,
      workerRunStatus: workerRun.status, independentVerifiers: attestation.value.costs.processes,
      verifierStatuses: verifications.map(item => item.status), outputRoot: root };
    await fs.writeFile(path.join(root, 'audit.json'), JSON.stringify(audit, null, 2) + '\n');
    process.stdout.write(JSON.stringify(audit) + '\n');
  } finally { await closeDatabase(); }
}

main().catch(failure => { process.stderr.write(failure.stack + '\n'); process.exitCode = 1; });
