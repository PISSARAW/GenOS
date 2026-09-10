/**
 * Point #8 — promotion différée : preuve d'approbation obligatoire, gate
 * évaluée avant exécution, confinement capsule des racines de merge.
 *
 * Couvre backend/src/services/strategyPromotionGate.js (via approveRun et en
 * direct) et la séparation requester/décideur de strategyExecutionController.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

process.env.NODE_ENV = 'test';
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'test-admin-password-promotion-gate';
process.env.GENOS_PROMOTION_SECRET = process.env.GENOS_PROMOTION_SECRET || 'test-promotion-secret-promotion-gate';

const { getDatabase, closeDatabase } = require('../src/db');
const strategyContracts = require('../src/services/strategyContractService');
const strategyService = require('../src/services/strategyExecutionService');
const promotionGate = require('../src/services/strategyPromotionGate');
const strategyExecutionController = require('../src/controllers/strategyExecutionController');
const signatureService = require('../src/services/promotionSignatureService');

function validReceipt() {
  return {
    approved: true,
    approvalId: 'approval-gate-1',
    approverId: 'reviewer-1',
    approvedAt: new Date().toISOString(),
    payloadHash: 'b'.repeat(64)
  };
}

function evidenceReport() {
  return { outcome: 'success', claims: [{ statement: 'Promotion audited', evidence: ['security-review'] }] };
}

async function setupRun(db, setup) {
  const agentId = setup.agentId;
  const workspaceId = setup.workspaceId;
  await db.run("INSERT OR REPLACE INTO agents (id, workspace_id, name, role, status, execution_mode) VALUES (?, ?, 'Gate Agent', 'orchestrator', 'running', 'orchestrator')", agentId, workspaceId);
  const contractRecord = await strategyContracts.saveContract(db, { agentId, problem: 'High risk mission requiring gates' });
  const contract = contractRecord.contract;
  Object.assign(contract.promotion, setup.promotionPatch || {});
  const hash = strategyContracts.hashContract(contract);
  await db.run('UPDATE strategy_contracts SET contract_json = ?, contract_hash = ? WHERE id = ?', JSON.stringify(contract), hash, contractRecord.id);
  const run = await strategyService.createExecutionRun(db, {
    agentId,
    contractRecord: { ...contractRecord, contract },
    budget: { tokens: 10000, costUsd: 1, latencyMs: 30000, events: 50 }
  });
  await db.run("UPDATE strategy_execution_runs SET status = 'awaiting_approval' WHERE id = ?", run.id);
  return { run, contractRecord };
}

async function proofSuite() {
  const turns = [{ action: 'human_approval', pass: true }];
  const receipt = validReceipt();
  assert.deepEqual(promotionGate.assertApprovalProof({ turns, report: null }, { humanApprovalReceipt: receipt }, 'run-1'), receipt);
  assert.equal(promotionGate.assertApprovalProof({ turns, report: null }, {}, 'run-1'), null);
  assert.equal(promotionGate.assertApprovalProof({ turns: [], report: { human_approval: true } }, {}, 'run-1'), null);
  assert.equal(promotionGate.assertApprovalProof({ turns: [], report: null }, { approvedBy: 'auditor' }, 'run-1'), null);
  assert.throws(() => promotionGate.assertApprovalProof({ turns: [], report: null }, {}, 'run-1'), /requires a human approval proof/);
  assert.throws(
    () => promotionGate.assertApprovalProof({ turns, report: null }, { humanApprovalReceipt: { approved: true } }, 'run-1'),
    /Invalid humanApprovalReceipt/
  );
  assert.throws(
    () => promotionGate.assertApprovalProof({ turns: [{ action: 'human_approval', pass: false }], report: null }, {}, 'run-1'),
    /human approval was denied/
  );
  assert.throws(
    () => promotionGate.assertApprovalProof({ turns: [], report: { human_approval: false } }, {}, 'run-1'),
    /human approval was denied/
  );
  console.log('Promotion approval proof checks passed.');
}

async function gateSuite(db) {
  await db.run("INSERT OR REPLACE INTO workspaces (id, name, path) VALUES ('workspace-gate-1', 'Gate', '/tmp/gate')");
  // Sans preuve → refus avant même l'évaluation de la gate.
  const first = await setupRun(db, { agentId: 'agent-gate-1', workspaceId: 'workspace-gate-1', promotionPatch: { require_human_approval: true } });
  await assert.rejects(strategyService.approveRun(db, first.run.id, { report: evidenceReport() }), /requires a human approval proof/);
  assert.equal((await db.get('SELECT status FROM strategy_execution_runs WHERE id = ?', first.run.id)).status, 'awaiting_approval');

  // Preuve par turns mais gate human_approval sans receipt → gate refusée.
  const second = await setupRun(db, { agentId: 'agent-gate-2', workspaceId: 'workspace-gate-1', promotionPatch: { require_human_approval: true } });
  await assert.rejects(
    strategyService.approveRun(db, second.run.id, { report: evidenceReport(), turns: [{ action: 'human_approval', pass: true }] }),
    /Promotion gate refused.*require_human_approval/
  );

  // Receipt valide + preuves → la gate passe, le pipeline (hors périmètre) échoue ensuite.
  const third = await setupRun(db, { agentId: 'agent-gate-3', workspaceId: 'workspace-gate-1', promotionPatch: { require_human_approval: true } });
  await assert.rejects(
    strategyService.approveRun(db, third.run.id, { report: evidenceReport(), humanApprovalReceipt: validReceipt() }),
    /promotion failed/
  );

  // Replay exigé sans receipt → gate refusée sur require_replay.
  const fourth = await setupRun(db, { agentId: 'agent-gate-4', workspaceId: 'workspace-gate-1', promotionPatch: { require_replay: true, require_human_approval: false, require_independent_verification: false } });
  await assert.rejects(
    strategyService.approveRun(db, fourth.run.id, { report: evidenceReport(), approvedBy: 'auditor' }),
    /Promotion gate refused.*require_replay/
  );
  console.log('Promotion gate evaluation checks passed.');
}

async function containmentSuite(db) {
  const capsule = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-capsule-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-outside-'));
  const winner = path.join(capsule, 'winner');
  const target = path.join(capsule, 'target');
  fs.mkdirSync(winner, { recursive: true });
  fs.mkdirSync(target, { recursive: true });
  await db.run('INSERT OR REPLACE INTO workspaces (id, name, path) VALUES (?, ?, ?)', 'workspace-capsule', 'Capsule', capsule);
  const options = { report: evidenceReport(), approvedBy: 'auditor', winnerWorkspaceRoot: winner, targetWorkspaceRoot: outside };

  const blocked = await setupRun(db, { agentId: 'agent-capsule-1', workspaceId: 'workspace-capsule', promotionPatch: { require_human_approval: false, require_independent_verification: false } });
  await assert.rejects(strategyService.approveRun(db, blocked.run.id, options), /confinement refused/);
  assert.equal((await db.get('SELECT status FROM strategy_execution_runs WHERE id = ?', blocked.run.id)).status, 'awaiting_approval');

  const inside = await setupRun(db, { agentId: 'agent-capsule-2', workspaceId: 'workspace-capsule', promotionPatch: { require_human_approval: false, require_independent_verification: false } });
  await assert.rejects(
    strategyService.approveRun(db, inside.run.id, { ...options, targetWorkspaceRoot: target }),
    /promotion failed/
  );
  fs.rmSync(capsule, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
  console.log('Promotion confinement checks passed.');
}

function mockControllerRes() {
  const res = {
    statusCode: 200,
    body: null,
    status: (code) => { res.statusCode = code; return res; },
    json: (data) => { res.body = data; return res; }
  };
  return res;
}

async function controllerSeparationSuite(db) {
  await db.run("INSERT OR REPLACE INTO workspaces (id, name, path) VALUES ('workspace-sep-ctrl', 'Sep', '/tmp/sep')");
  await db.run("INSERT OR REPLACE INTO agents (id, workspace_id, name, role, status, execution_mode) VALUES ('agent-sep-ctrl', 'workspace-sep-ctrl', 'Sep Agent', 'orchestrator', 'running', 'orchestrator')");
  const contractRecord = await strategyContracts.saveContract(db, { agentId: 'agent-sep-ctrl', problem: 'Separation check', createdBy: 'studio-op' });
  const run = await strategyService.createExecutionRun(db, { agentId: 'agent-sep-ctrl', contractRecord, budget: { tokens: 100, costUsd: 1, latencyMs: 1000, events: 5 } });
  await db.run("UPDATE strategy_execution_runs SET status = 'awaiting_approval' WHERE id = ?", run.id);

  const selfPayload = { runId: run.id, timestamp: Date.now(), signerId: 'studio-op' };
  const selfRes = mockControllerRes();
  await strategyExecutionController.approve({
    params: { runId: run.id },
    body: { signature: signatureService.generateSignature(selfPayload), timestamp: selfPayload.timestamp, signerId: selfPayload.signerId },
    user: { username: 'studio-op' }
  }, selfRes);
  assert.equal(selfRes.statusCode, 409);
  assert.equal(selfRes.body.error.code, 'APPROVAL_SEPARATION_REQUIRED');

  const otherPayload = { runId: run.id, timestamp: Date.now(), signerId: 'auditor' };
  const otherRes = mockControllerRes();
  await strategyExecutionController.approve({
    params: { runId: run.id },
    body: { signature: signatureService.generateSignature(otherPayload), timestamp: otherPayload.timestamp, signerId: otherPayload.signerId },
    user: { username: 'auditor' }
  }, otherRes);
  assert.equal(otherRes.statusCode, 409);
  assert.equal(otherRes.body.error.code, 'INVALID_EXECUTION_APPROVAL');
  console.log('Strategy controller separation checks passed.');
}

async function run() {
  await proofSuite();
  const dbPath = path.resolve(__dirname, 'test-promotion-gate.db');
  for (const suffix of ['', '-shm', '-wal']) {
    if (fs.existsSync(`${dbPath}${suffix}`)) fs.unlinkSync(`${dbPath}${suffix}`);
  }
  const db = await getDatabase(dbPath);
  try {
    await gateSuite(db);
    await containmentSuite(db);
    await controllerSeparationSuite(db);
    console.log('Promotion gate checks passed.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) {
      if (fs.existsSync(`${dbPath}${suffix}`)) fs.unlinkSync(`${dbPath}${suffix}`);
    }
  }
}

run().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
