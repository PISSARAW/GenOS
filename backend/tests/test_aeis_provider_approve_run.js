'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { providerFixture } = require('./test_aeis_provider_process_roundtrip');
const { getDatabase, closeDatabase } = require('../src/db');
const contracts = require('../src/services/strategyContractService');
const runs = require('../src/services/strategyExecutionService');

process.env.GENOS_ADMIN_PASSWORD ||= 'aeis-provider-approval-test';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= crypto.randomBytes(32).toString('hex');

async function prepare(db, root, fixtures) {
  await db.run("INSERT INTO workspaces (id, name, path) VALUES ('ws-provider', 'AEIS provider approval', ?)", root);
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES ('provider-agent', 'AEIS provider', 'orchestrator', 'running', 'orchestrator', 'ws-provider')");
  for (const [index, provider] of ['lmstudio', 'ollama'].entries()) {
    await db.run('INSERT INTO provider_configs (provider, model, endpoint, enabled) VALUES (?, ?, ?, 1)',
      provider, fixtures[index].model, fixtures[index].endpoint);
  }
  const record = await contracts.saveContract(db, { agentId: 'provider-agent', problem: 'High risk verified command promotion' });
  record.contract.problem_profile.multi_provider_verification = true;
  record.contract.problem_profile.aeis_provider_allowlist = ['lmstudio', 'ollama'];
  record.contract.promotion.require_human_approval = true;
  record.contract_hash = contracts.hashContract(record.contract);
  await db.run('UPDATE strategy_contracts SET contract_json = ?, contract_hash = ? WHERE id = ?',
    JSON.stringify(record.contract), record.contract_hash, record.id);
  return record;
}

async function awaiting(db, contractRecord) {
  const run = await runs.createExecutionRun(db, { agentId: 'provider-agent', contractRecord,
    budget: { tokens: 10000, costUsd: 1, latencyMs: 30000, events: 50 } });
  await db.run("UPDATE strategy_execution_runs SET status = 'awaiting_approval' WHERE id = ?", run.id);
  await db.run("UPDATE strategy_execution_steps SET status = 'awaiting_approval' WHERE run_id = ? AND sequence = 7", run.id);
  return run;
}

function approval(run, record, root) {
  return { report: { outcome: 'success', claims: [{ statement: 'npm test exits with code 0',
    evidence: [{ kind: 'reproducible_artifact', content: { fixture: 'provider-approval' } }],
    test: { command: 'npm test', replicas: { proof: { cwd: path.join(root, 'a') }, source: { cwd: path.join(root, 'b') } } } }] },
  humanApprovalReceipt: { approved: true, approvalId: `approval-${run.id}`, approverId: 'test-auditor',
    approvedAt: new Date().toISOString(), payloadHash: record.contract_hash.replace(/^sha256:/, '') } };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aeis-provider-approve-'));
  const fixtures = [await providerFixture('review-a'), await providerFixture('review-b')];
  try {
    for (const replica of ['a', 'b']) {
      const cwd = path.join(root, replica);
      fs.mkdirSync(cwd);
      fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: `aeis-provider-${replica}`,
        version: '1.0.0', scripts: { test: 'node verify.cjs' } }));
      fs.writeFileSync(path.join(cwd, 'verify.cjs'), `require('node:assert/strict').equal(${replica === 'a' ? '2 + 2' : '[1, 1, 1, 1].length'}, 4);`);
    }
    const db = await getDatabase(path.join(root, 'approval.db'));
    const record = await prepare(db, root, fixtures);
    const positive = await awaiting(db, record);
    assert.equal((await runs.approveRun(db, positive.id, approval(positive, record, root))).status, 'completed');
    const reviews = await db.all('SELECT provider, verdict, process_id FROM aeis_provider_reviews WHERE run_id = ?', positive.id);
    assert.equal(reviews.length, 2);
    assert.equal(new Set(reviews.map((row) => row.process_id)).size, 2);
    assert.ok(reviews.every((row) => row.verdict === 'supports' && row.process_id !== process.pid));
    const learned = await db.get("SELECT * FROM epistemic_immune_memory_scoped WHERE scope_id = 'local:local:ws-provider'");
    assert.equal(learned.successes, 1);
    fixtures[1].verdict = 'refutes';
    const negative = await awaiting(db, record);
    await assert.rejects(runs.approveRun(db, negative.id, approval(negative, record, root)), /epistemic assurance|multi_provider|AEIS|proof_verification/i);
    assert.equal((await db.get('SELECT status FROM strategy_execution_runs WHERE id = ?', negative.id)).status, 'awaiting_approval');
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM aeis_provider_reviews WHERE run_id = ? AND verdict = ?', negative.id, 'refutes')).n, 1);
    await db.run("UPDATE provider_configs SET enabled = 0 WHERE provider = 'ollama'");
    const missing = await awaiting(db, record);
    await assert.rejects(runs.approveRun(db, missing.id, approval(missing, record, root)), /epistemic assurance|multi_provider|AEIS|proof_verification/i);
    assert.equal((await db.get('SELECT status FROM strategy_execution_runs WHERE id = ?', missing.id)).status, 'awaiting_approval');
    console.log('AEIS approveRun SQLite + real provider workers: supports promoted; dissent and missing quorum blocked: PASS');
  } finally {
    await closeDatabase();
    for (const fixture of fixtures) fixture.server.closeAllConnections();
    await Promise.all(fixtures.map((fixture) => new Promise((resolve) => fixture.server.close(resolve))));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
