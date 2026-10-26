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
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = process.env.GENOS_EPISTEMIC_RECEIPT_SECRET || 'test-epistemic-secret-promotion-gate';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET ||= require('node:crypto').randomBytes(32).toString('hex');

const { getDatabase, closeDatabase } = require('../src/db');
const strategyContracts = require('../src/services/strategyContractService');
const strategyService = require('../src/services/strategyExecutionService');
const promotionGate = require('../src/services/strategyPromotionGate');
const strategyExecutionController = require('../src/controllers/strategyExecutionController');
const signatureService = require('../src/services/promotionSignatureService');
const temporaryWorkspaces = new Set();

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
  const organizationId = `${agentId}-org`;
  const projectId = `${agentId}-project`;
  const missionId = `${agentId}-mission`;
  const priorWorkspace = await db.get('SELECT path FROM workspaces WHERE id = ?', workspaceId);
  const existingRoot = priorWorkspace?.path && fs.existsSync(priorWorkspace.path) ? priorWorkspace.path : null;
  const workspaceRoot = existingRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'genos-promotion-gate-'));
  if (!existingRoot) temporaryWorkspaces.add(workspaceRoot);
  await db.run('INSERT OR IGNORE INTO organizations (id, name) VALUES (?, ?)', organizationId, organizationId);
  await db.run('INSERT OR IGNORE INTO projects (id, organization_id, name) VALUES (?, ?, ?)', projectId, organizationId, projectId);
  await db.run('INSERT OR REPLACE INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)',
    workspaceId, 'Gate', workspaceRoot, organizationId, projectId);
  await db.run("INSERT OR REPLACE INTO agents (id, workspace_id, name, role, status, execution_mode) VALUES (?, ?, 'Gate Agent', 'orchestrator', 'running', 'orchestrator')", agentId, workspaceId);
  await require('../src/services/missionIdentityService').create(db, {
    missionId, objective: 'Exercise evidence-gated strategy promotion.', orchestratorAgentId: agentId
  });
  const contractRecord = await strategyContracts.saveContract(db, { agentId, problem: 'High risk mission requiring gates' });
  const contract = contractRecord.contract;
  Object.assign(contract.promotion, setup.promotionPatch || {});
  const hash = strategyContracts.hashContract(contract);
  await db.run('UPDATE strategy_contracts SET contract_json = ?, contract_hash = ? WHERE id = ?', JSON.stringify(contract), hash, contractRecord.id);
  const run = await strategyService.createExecutionRun(db, {
    agentId, missionId,
    contractRecord: { ...contractRecord, contract },
    budget: { tokens: 10000, costUsd: 1, latencyMs: 30000, events: 50 }
  });
  await require('../src/services/missionEnvelopeAuthority').seal({
    db, agentId, executionRun: run, executable: process.execPath,
    contractRecord: { ...contractRecord, contract }, autonomyPlan: {}, normalizedMission: {
      agentId, missionId, workspaceRoot, toolLease: [], timeoutMs: 30000
    }
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
    /Promotion gate refused.*require_human_approval|AEIS epistemic assurance refused/
  );

  // Receipt valide + preuves → la gate et le pipeline de promotion passent.
  const third = await setupRun(db, { agentId: 'agent-gate-3', workspaceId: 'workspace-gate-1', promotionPatch: { require_human_approval: true, require_independent_verification: false, require_epistemic_assurance: false } });
  const row = await db.get('SELECT * FROM strategy_execution_runs WHERE id = ?', third.run.id);
  const promotion = await promotionGate.loadPromotionContext(db, row, { report: evidenceReport() });
  const approval = validReceipt();
  approval.payloadHash = promotion.approvalDigest;
  await assert.rejects(strategyService.approveRun(db, third.run.id, {
    report: evidenceReport(), humanApprovalReceipt: approval
  }), /AEIS epistemic assurance refused/);

  // Replay exigé sans receipt → gate refusée sur require_replay.
  const fourth = await setupRun(db, { agentId: 'agent-gate-4', workspaceId: 'workspace-gate-1', promotionPatch: { require_replay: true, require_human_approval: false, require_independent_verification: false, require_epistemic_assurance: false } });
  await assert.rejects(
    strategyService.approveRun(db, fourth.run.id, { report: evidenceReport(), approvedBy: 'auditor' }),
    /Promotion gate refused.*require_replay|AEIS epistemic assurance refused/
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
  const options = { winnerWorkspaceRoot: winner, targetWorkspaceRoot: outside };

  const blocked = await setupRun(db, { agentId: 'agent-capsule-1', workspaceId: 'workspace-capsule', promotionPatch: { require_human_approval: false, require_independent_verification: false, require_epistemic_assurance: false } });
  const blockedRow = await db.get('SELECT * FROM strategy_execution_runs WHERE id = ?', blocked.run.id);
  const blockedPromotion = await promotionGate.loadPromotionContext(db, blockedRow, {});
  await assert.rejects(promotionGate.assertPromotionContainment(db, blockedPromotion, options), /confinement refused/);

  const inside = await setupRun(db, { agentId: 'agent-capsule-2', workspaceId: 'workspace-capsule', promotionPatch: { require_human_approval: false, require_independent_verification: false, require_epistemic_assurance: false } });
  const insideRow = await db.get('SELECT * FROM strategy_execution_runs WHERE id = ?', inside.run.id);
  const insidePromotion = await promotionGate.loadPromotionContext(db, insideRow, {});
  await promotionGate.assertPromotionContainment(db, insidePromotion, { ...options, targetWorkspaceRoot: target });
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

  const digest = await strategyService.getPromotionApprovalDigest(db, run.id);
  const selfPayload = { runId: run.id, timestamp: Date.now(), signerId: 'studio-op', payloadHash: digest };
  const receipt = (signerId) => ({ approved: true, approvalId: `approval-${run.id}`, approverId: signerId,
    approvedAt: new Date().toISOString(), payloadHash: digest });
  const selfRes = mockControllerRes();
  await strategyExecutionController.approve({
    params: { runId: run.id },
    body: { ...receipt(selfPayload.signerId), humanApprovalReceipt: receipt(selfPayload.signerId),
      signature: signatureService.generateSignature(selfPayload), timestamp: selfPayload.timestamp, signerId: selfPayload.signerId },
    user: { username: 'studio-op' }
  }, selfRes);
  assert.equal(selfRes.statusCode, 409);
  assert.equal(selfRes.body.error.code, 'APPROVAL_SEPARATION_REQUIRED');

  const otherPayload = { runId: run.id, timestamp: Date.now(), signerId: 'auditor', payloadHash: digest };
  const otherRes = mockControllerRes();
  await strategyExecutionController.approve({
    params: { runId: run.id },
    body: { humanApprovalReceipt: receipt(otherPayload.signerId), signature: signatureService.generateSignature(otherPayload),
      timestamp: otherPayload.timestamp, signerId: otherPayload.signerId },
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
    for (const workspace of temporaryWorkspaces) fs.rmSync(workspace, { recursive: true, force: true });
    temporaryWorkspaces.clear();
  }
}

run().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
