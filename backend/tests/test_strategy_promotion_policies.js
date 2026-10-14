const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
process.env.NODE_ENV = 'test';
process.env.GENOS_ADMIN_PASSWORD ||= 'promotion-policy-test-only';
const { getDatabase, closeDatabase } = require('../src/db');
const strategyContracts = require('../src/services/strategyContractService');
const strategyService = require('../src/services/strategyExecutionService');
const promotionPolicy = require('../src/services/strategyPromotionPolicyService');
const strategyPromotionGate = require('../src/services/strategyPromotionGate');
const promotionGateContext = require('../src/services/promotionGateContext');

async function run() {
  console.log('--- Testing Strategy Promotion Policies ---');
  await require('./helpers/strategyVerifierReceiptGates').assertVerifierReceiptGates(promotionPolicy);

  // Test 1: evaluatePromotionGate unit checks
  const contractWithPolicies = {
    promotion: {
      require_replay: true,
      require_independent_verification: true,
      require_human_approval: true,
      preserve_rejected_branches: true,
      merge_workspace_automatically: false
    }
  };

  const mergeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-promotion-merge-'));
  const winnerWorkspaceRoot = path.join(mergeRoot, 'winner');
  const targetWorkspaceRoot = path.join(mergeRoot, 'target');
  fs.mkdirSync(path.join(winnerWorkspaceRoot, 'nested'), { recursive: true });
  fs.mkdirSync(targetWorkspaceRoot, { recursive: true });
  fs.writeFileSync(path.join(winnerWorkspaceRoot, 'nested', 'promoted.txt'), 'winner change');
  fs.writeFileSync(path.join(targetWorkspaceRoot, 'existing.txt'), 'target content');
  try {
    const merged = await promotionPolicy.applyPostPromotionPolicies(null, {
      promotion: { merge_workspace_automatically: true }
    }, { winnerWorkspaceRoot, targetWorkspaceRoot });
    assert.equal(merged.success, true);
    assert.equal(merged.actionsTaken[0].merged, true);
    assert.equal(fs.readFileSync(path.join(targetWorkspaceRoot, 'nested', 'promoted.txt'), 'utf8'), 'winner change');
    assert.equal(fs.readFileSync(path.join(targetWorkspaceRoot, 'existing.txt'), 'utf8'), 'target content');

    const causalBaseWorkspaceRoot = path.join(mergeRoot, 'base');
    fs.mkdirSync(causalBaseWorkspaceRoot, { recursive: true });
    fs.writeFileSync(path.join(causalBaseWorkspaceRoot, 'causal.txt'), 'base version');
    fs.writeFileSync(path.join(targetWorkspaceRoot, 'causal.txt'), 'base version');
    fs.writeFileSync(path.join(winnerWorkspaceRoot, 'causal.txt'), 'winner version');
    const causallyMerged = await promotionPolicy.applyPostPromotionPolicies(null, {
      promotion: { merge_workspace_automatically: true }
    }, { winnerWorkspaceRoot, targetWorkspaceRoot, causalBaseWorkspaceRoot });
    assert.equal(causallyMerged.success, true);
    assert.equal(fs.readFileSync(path.join(targetWorkspaceRoot, 'causal.txt'), 'utf8'), 'winner version');

    fs.writeFileSync(path.join(winnerWorkspaceRoot, 'conflict.txt'), 'winner version');
    fs.writeFileSync(path.join(targetWorkspaceRoot, 'conflict.txt'), 'target version');
    const conflicted = await promotionPolicy.applyPostPromotionPolicies(null, {
      promotion: { merge_workspace_automatically: true }
    }, { winnerWorkspaceRoot, targetWorkspaceRoot });
    assert.equal(conflicted.success, false);
    assert.equal(conflicted.actionsTaken[0].status, 'conflict');
    assert.equal(fs.readFileSync(path.join(targetWorkspaceRoot, 'conflict.txt'), 'utf8'), 'target version');
  } finally {
    fs.rmSync(mergeRoot, { recursive: true, force: true });
  }

  const evalFail = promotionPolicy.evaluatePromotionGate(contractWithPolicies, {
    replayVerified: false,
    independentVerification: false,
    humanApproved: false
  });
  assert.equal(evalFail.eligible, false);
  assert(evalFail.violations.some((v) => v.policy === 'require_replay'));
  assert(evalFail.violations.some((v) => v.policy === 'require_independent_verification'));
  assert(evalFail.violations.some((v) => v.policy === 'require_human_approval'));

  // Un receipt indépendant signé (mock car sans secret) doit maintenant être rejeté
  // si la liste de vérificateurs de confiance est vide (comportement attendu)
  const evalWithUnsignedReceipt = promotionPolicy.evaluatePromotionGate(contractWithPolicies, {
    replayVerified: true,
    independentVerifierReceipt: {
      resultId: 'test-result',
      evidenceDigest: 'sha256:' + 'a'.repeat(64),
      verifierDigest: 'sha256:' + 'b'.repeat(64),
      independent: true,
      status: 'verified',
      checkedAt: new Date().toISOString(),
      nonce: 'test-nonce',
      signature: 'fake-signature-for-now'
    }
  });
  // Sans trustedVerifierDigests configurés, le receipt ne peut pas être validé
  assert.equal(evalWithUnsignedReceipt.eligible, false);
  assert(evalWithUnsignedReceipt.violations.some((v) => v.policy === 'require_independent_verification'));
  assert.equal(
    promotionPolicy.evaluatePromotionGate(contractWithPolicies, {
      replayVerified: true,
      report: { claims: [{ statement: 'unsupported claim' }] },
      humanApprovalReceipt: {
        approved: true,
        approvalId: 'approval-test',
        approverId: 'reviewer-test',
        approvedAt: new Date().toISOString(),
        payloadHash: 'a'.repeat(64)
      }
    }).eligible,
    false,
    'Claims without evidence must not satisfy independent verification'
  );
  assert.equal(promotionPolicy.evaluatePromotionGate(contractWithPolicies, {
    replayVerified: true,
    verifiedClaims: ['fake'],
    humanApproved: true
  }).eligible, false, 'Unstructured verified claims must not satisfy independent verification');

  assert.equal(promotionPolicy.evaluatePromotionGate({ promotion: { require_replay: true } }, { replayReceipt: {} }).eligible, false);
  assert.equal(promotionPolicy.evaluatePromotionGate({ promotion: { require_replay: true } }, {
    replayVerified: true, diffAndReplayPassed: true
  }).eligible, false, 'Boolean replay claims cannot satisfy promotion');
  assert.equal(promotionPolicy.evaluatePromotionGate({ promotion: { require_replay: true } }, { replayReceipt: { success: true, replayStatus: 'RECONSTRUCTED' } }).eligible, false);
  assert.equal(promotionPolicy.evaluatePromotionGate({ promotion: { require_replay: true } }, {
    runId: 'run-1', agentId: 'agent-1', replayReceipt: { success: true, status: 'verified' }
  }).eligible, false, 'A success/status-only replay receipt is not run-bound proof');
  const untrustedReplay = { success: true, status: 'completed', runId: 'run-1' };
  const trustedGate = promotionGateContext.buildGateContext({
    promotion: { runId: 'run-1', agentId: 'agent-1' }, options: { replayReceipt: untrustedReplay }
  });
  assert.equal(trustedGate.replayReceipt, null, 'Approval options cannot inject a replay receipt');
  assert.match(strategyPromotionGate.completionGuardrail({ promotion: { require_replay: true } }, {
    replayVerified: true, diffAndReplayPassed: true, replayReceipt: untrustedReplay
  }, 'agent-1'), /require_replay/, 'Terminal event claims cannot satisfy the replay gate');
  console.log('✓ Point 3.1: evaluatePromotionGate correctly enforces replay and verification');

  // Test 2: applyPostPromotionPolicies
  const dbPath = path.resolve(__dirname, 'test-promotion-policies.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  const archiveRoot = path.resolve(__dirname, '.tmp-rejected-branches');
  fs.rmSync(archiveRoot, { recursive: true, force: true });
  fs.mkdirSync(archiveRoot, { recursive: true });
  process.env.GENOS_SNAPSHOT_ROOT = path.join(archiveRoot, 'snapshot-store');

  try {
    const archiveWorkspace = { id: 'rejected-branch-ws', path: archiveRoot };
    await db.run('INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)', archiveWorkspace.id, 'Rejected branches', archiveRoot);
    await db.run(`INSERT OR REPLACE INTO agents (id, name, role, status, execution_mode, workspace_id)
      VALUES ('agent-policy-test', 'Policy Agent', 'orchestrator', 'running', 'orchestrator', ?)`, archiveWorkspace.id);
    const snapshots = require('../src/services/workspaceSnapshotStore');
    const rejectedBranches = [];
    for (const branchId of ['branch_reject_1', 'branch_reject_2']) {
      const sourcePath = path.join(archiveRoot, branchId);
      fs.mkdirSync(sourcePath);
      fs.writeFileSync(path.join(sourcePath, 'candidate.txt'), branchId);
      const snapshot = await snapshots.capture({ db, workspace: archiveWorkspace, sourcePath,
        label: branchId, author: 'test', agentId: 'agent-policy-test', branchId });
      rejectedBranches.push({ branchId, workspaceId: archiveWorkspace.id, snapshotId: snapshot.id });
    }
    const postRes = await promotionPolicy.applyPostPromotionPolicies(db, contractWithPolicies, {
      agentId: 'agent-policy-test',
      runId: 'policy-promotion-run', rejectedBranches,
      winnerWorkspaceRoot: '/tmp/winner',
      targetWorkspaceRoot: '/tmp/target'
    });
    assert.equal(postRes.success, true, JSON.stringify(postRes));
    assert.equal(postRes.actionsTaken.filter((a) => a.action === 'preserve_branch').length, 2);
    assert.equal((await db.all('SELECT * FROM strategy_rejected_branch_archives')).length, 2);

    const preservedEvents = await db.all("SELECT * FROM telemetry_events WHERE event_type = 'BRANCH_PRESERVED'");
    assert.equal(preservedEvents.length, 2);
    console.log('✓ Point 3.2: applyPostPromotionPolicies archives rejected snapshots durably');
    const failedPreservation = await promotionPolicy.applyPostPromotionPolicies({ run: async () => { throw new Error('telemetry unavailable'); } }, contractWithPolicies, { rejectedBranchIds: ['branch-failed'] });
    assert.equal(failedPreservation.success, false);
    assert.equal(failedPreservation.actionsTaken[0].preserved, false);

    // Test 3: Integration with recordExecutionEvent
    await db.run("INSERT OR REPLACE INTO agents (id, name, role, status, execution_mode) VALUES ('agent-policy-test', 'Policy Agent', 'orchestrator', 'running', 'orchestrator')");
    const contractRecord = await strategyContracts.saveContract(db, {
      agentId: 'agent-policy-test',
      problem: 'High risk mission requiring replay and verification'
    });

    const contract = contractRecord.contract;
    contract.promotion.require_replay = true;
    contract.promotion.require_independent_verification = true;
    contract.promotion.require_human_approval = false;
    const hash = strategyContracts.hashContract(contract);
    await db.run('UPDATE strategy_contracts SET contract_json = ?, contract_hash = ? WHERE id = ?', JSON.stringify(contract), hash, contractRecord.id);

    const run = await strategyService.createExecutionRun(db, {
      agentId: 'agent-policy-test',
      contractRecord: { ...contractRecord, contract },
      budget: { tokens: 10000, costUsd: 1, latencyMs: 30000, events: 50 }
    });

    // Event completing without replay: should be blocked by promotion gate
    const failRes = await strategyService.recordExecutionEvent(db, 'agent-policy-test', {
      eventType: 'AGENT_COMPLETED',
      action: 'COMPLETE',
      detail: 'Done without replay',
      payload: { executionRunId: run.id, replayVerified: false, independentVerification: true }
    });
    assert.equal(failRes.halt, true);
    assert.match(failRes.reason, /Promotion gate blocked.*require_replay/);
    console.log('✓ Point 3.3: Missing replay verification blocks execution completion');

  } finally {
    await closeDatabase();
    fs.rmSync(archiveRoot, { recursive: true, force: true });
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    for (const suffix of ['-shm', '-wal']) {
      if (fs.existsSync(`${dbPath}${suffix}`)) fs.unlinkSync(`${dbPath}${suffix}`);
    }
  }

  console.log('✅ All Strategy Promotion Policy tests passed.');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
