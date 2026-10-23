'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const dbPath = path.join(os.tmpdir(), `genos_test_execution_receipts_${Date.now()}.db`);
process.env.GENOS_DB_PATH = dbPath;
process.env.GENOS_ADMIN_PASSWORD = 'test-only';

const { getDatabase, closeDatabase } = require('../src/db');
const missionIdentity = require('../src/services/missionIdentityService');
const { executeProposal } = require('../src/services/localCodeWorkerService');
const receipts = require('../src/services/localCodeTestExecutionReceiptService');
const { collectMissionEvidence, buildEvidenceFlags, buildEvidenceKinds } = require('../src/services/missionEvidenceCollector');
const { buildMissionContext } = require('../bin/orchestratorMissionHelpersBuildContext.cjs');

function proposal(content) {
  return JSON.stringify({ format: 'genos.file-replacement/v1',
    patches: [{ path: 'src/app.js', content }], tests: ['npm test'], evidence: 'repair candidate' });
}

async function createMission(db, missionId, workerId) {
  const orchestratorId = `${workerId}-orchestrator`;
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, current_task)
    VALUES (?, 'Orchestrator', 'orchestrator', 'completed', 'orchestrator', 'receipt test')`, orchestratorId);
  await missionIdentity.create(db, { missionId, objective: 'Fix bug and run tests', orchestratorAgentId: orchestratorId });
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, parent_agent_id, current_task)
    VALUES (?, 'Code worker', 'implementation', 'completed', 'worker', ?, 'receipt test')`, workerId, orchestratorId);
  await missionIdentity.attachAgent(db, { missionId, agentId: workerId, role: 'implementation' });
  return [{ id: orchestratorId, status: 'completed', execution_mode: 'orchestrator' },
    { id: workerId, status: 'completed', execution_mode: 'worker' }];
}

async function makeWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-test-receipt-workspace-'));
  await fs.mkdir(path.join(root, 'src'));
  await fs.mkdir(path.join(root, 'test'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test test/app.test.js' } }));
  await fs.writeFile(path.join(root, 'src/app.js'), "module.exports = () => 'broken';\n");
  await fs.writeFile(path.join(root, 'test/app.test.js'), [
    "const test = require('node:test');",
    "const assert = require('node:assert/strict');",
    "const app = require('../src/app');",
    "test('app returns its healthy state', () => assert.equal(app(), 'healthy'));"
  ].join('\n'));
  return root;
}

async function runProposal(db, input, content) {
  return executeProposal({ workspaceRoot: input.workspaceRoot, text: proposal(content),
    allowedCommands: ['npm test'], db,
    mission: { missionId: input.missionId, agentId: input.agentId || input.workerId },
    executionRun: { id: `${input.agentId || input.workerId}-run` } });
}

async function main() {
  const db = await getDatabase(dbPath);
  const healthyRoot = await makeWorkspace();
  const failedRoot = await makeWorkspace();
  try {
    const healthyAgents = await createMission(db, 'test-receipt-passed', 'worker-receipt-passed');
    const healthy = await runProposal(db, { missionId: 'test-receipt-passed', workerId: 'worker-receipt-passed', workspaceRoot: healthyRoot },
      "module.exports = () => 'healthy';\n");
    assert.equal(healthy.testStatus, 'passed');
    assert.equal(healthy.testExecutionReceipt?.outcome, 'passed');
    assert.equal(healthy.tests[0].exitCode, 0);
    const passing = await receipts.collectVerifiedForMission(db, 'test-receipt-passed', healthyAgents);
    assert.equal(passing.length, 1, 'host-executed passing test batch verifies for a completed worker');
    const evidence = await collectMissionEvidence(db, 'test-receipt-passed', healthyAgents);
    assert.equal(evidence.flags.testsPassed, true);
    assert.ok(evidence.evidence.includes('test_suite_passed'));
    const context = await buildMissionContext({ db, missionId: 'test-receipt-passed', agents: healthyAgents,
      outcome: { success: true, structuralChecks: { testsPassed: false } },
      request: { mission: 'Fix bug and run tests' }, policyRequest: {} });
    assert.equal(context.context.structuralChecks.testsPassed, true,
      'homeostasis derives structural test success from the verified receipt');

    const windowsAgents = await createMission(db, 'test-receipt-windows-local', 'worker-windows-local');
    const orchestratorId = windowsAgents[0].id;
    const windowsRoot = await makeWorkspace();
    try {
      const windowsResult = await runProposal(db, { missionId: 'test-receipt-windows-local',
        workerId: 'worker-windows-local', agentId: orchestratorId, workspaceRoot: windowsRoot },
      "module.exports = () => 'healthy';\n");
      assert.equal(windowsResult.testStatus, 'passed');
      assert.equal((await receipts.collectVerifiedForMission(db, 'test-receipt-windows-local', windowsAgents)).length, 1,
        'Windows in-process code execution can attest under its completed orchestrator identity');
    } finally { await fs.rm(windowsRoot, { recursive: true, force: true }); }

    const failedAgents = await createMission(db, 'test-receipt-failed', 'worker-receipt-failed');
    const failed = await runProposal(db, { missionId: 'test-receipt-failed', workerId: 'worker-receipt-failed', workspaceRoot: failedRoot },
      "module.exports = () => 'still-broken';\n");
    assert.equal(failed.testStatus, 'failed');
    assert.equal(failed.testExecutionReceipt?.outcome, 'failed');
    assert.equal(failed.rolledBack, true);
    assert.equal(await fs.readFile(path.join(failedRoot, 'src/app.js'), 'utf8'), "module.exports = () => 'broken';\n");
    assert.equal((await receipts.collectVerifiedForMission(db, 'test-receipt-failed', failedAgents)).length, 0,
      'failed tests cannot satisfy homeostasis');

    const fakeTelemetry = [{ event_type: 'EVIDENCE_REPORT', payload_json: JSON.stringify({
      tests: [{ command: 'npm test', exitCode: 0 }], claims: [{ statement: 'tests passed' }]
    }) }];
    assert.equal(buildEvidenceFlags({ agents: healthyAgents, dossiers: [], telemetry: fakeTelemetry }).testsPassed, false,
      'worker-supplied telemetry cannot impersonate the trusted executor');
    assert.equal(buildEvidenceKinds({ dossiers: [], runs: [], telemetry: fakeTelemetry })
      .includes('test_suite_passed'), false);

    const row = await db.get('SELECT * FROM local_code_test_execution_receipts WHERE mission_id = ?', 'test-receipt-passed');
    await assert.rejects(db.run('UPDATE local_code_test_execution_receipts SET outcome = ? WHERE receipt_id = ?',
      'failed', row.receipt_id), /immutable/);
    await fs.writeFile(path.join(healthyRoot, 'src/app.js'), "module.exports = () => 'changed after test';\n");
    assert.equal((await receipts.collectVerifiedForMission(db, 'test-receipt-passed', healthyAgents)).length, 0,
      'a receipt is invalidated when the tested workspace changes');
    console.log('Trusted local code test execution receipts checks passed.');
  } finally {
    await fs.rm(healthyRoot, { recursive: true, force: true });
    await fs.rm(failedRoot, { recursive: true, force: true });
    await closeDatabase();
    await fs.rm(dbPath, { force: true });
    await fs.rm(`${dbPath}-wal`, { force: true });
    await fs.rm(`${dbPath}-shm`, { force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
