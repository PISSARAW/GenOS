'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const worker = require('../src/services/localCodeWorkerService');

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-review-'));
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec('CREATE TABLE local_code_test_execution_receipts (receipt_id TEXT, mission_id TEXT, agent_id TEXT, execution_run_id TEXT, outcome TEXT, receipt_hash TEXT, receipt_json TEXT)');
  const mission = { delegatedReviewOnly: true, localCodeWorker: true, workerKind: 'verifier_worker',
    missionId: 'review-mission', agentId: 'reviewer', executionPolicy: { allowFileEdits: false } };
  const proposal = { format: 'genos.test-only/v1', patches: [], tests: ['pytest'], evidence: 'review fixture' };
  const run = text => worker.executeProposal({ workspaceRoot: root, text: JSON.stringify(text),
    allowedCommands: ['pytest', 'node check_mutation.js'], db, mission, executionRun: { id: 'review-run' } });
  try {
    await fs.writeFile(path.join(root, 'answer.py'), 'value = 42\n');
    await fs.writeFile(path.join(root, 'test_answer.py'), 'from answer import value\ndef test_value():\n    assert value == 42\n');
    const result = await run(proposal);
    assert.equal(result.testStatus, 'passed');
    assert.deepEqual(result.changedFiles, []);
    const saved = await db.get('SELECT execution_run_id, agent_id FROM local_code_test_execution_receipts');
    assert.deepEqual(saved, { execution_run_id: 'review-run', agent_id: 'reviewer' });
    const report = require('../src/services/workerCodeEvidenceReport').build({ mission, proposal: result });
    assert.equal(report.workerArtifact.type, 'verification_report');
    await assert.rejects(run({ ...proposal, patches: [{ path: 'answer.py', content: 'value=0' }] }), { code: 'WORKER_OUTPUT_SCHEMA_VIOLATION' });
    await fs.writeFile(path.join(root, 'check_mutation.js'), "require('node:fs').writeFileSync('answer.py', 'value=0');");
    await assert.rejects(run({ ...proposal, tests: ['node check_mutation.js'] }), { code: 'WORKER_TEST_SCOPE_VIOLATION' });
    console.log('Read-only reviewer executes tests, binds receipts and rejects patches/mutations: PASS');
  } finally { await db.close(); await fs.rm(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
