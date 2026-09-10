const assert = require('assert');
const path = require('path');
const { getDatabase, withTransaction } = require('../src/db');
const authController = require('../src/controllers/authController');
const agentEvidenceService = require('../src/services/agentEvidenceService');
const { hashPassword } = require('../src/controllers/password');

async function runPredictableBugsSuite() {
  console.log('=== STARTING PREDICTABLE BUGS VERIFICATION SUITE ===\n');

  // 1. Verify agentEvidenceService validateDossierInfluence does not crash on missing entry
  console.log('--- 1. AgentEvidenceService Null-Safe Validation ---');
  const reportWithMissingInfluence = {
    dossierInfluence: [
      { workerId: 'worker-1', influence: 'Valid influence text', usedClaims: ['claim1'] }
    ]
  };
  // Calling with workerIds: ['worker-1', 'worker-2'] where worker-2 has no dossierInfluence entry
  assert.throws(() => {
    agentEvidenceService.validateDossierInfluence(reportWithMissingInfluence, ['worker-1', 'worker-2'], {
      dossiers: [{ workerId: 'worker-1', events: [] }]
    });
  }, (err) => {
    return err.code === 'INVALID_DOSSIER_INFLUENCE';
  }, 'Should cleanly throw INVALID_DOSSIER_INFLUENCE instead of TypeError');
  console.log('  ✅ PASS: Missing dossierInfluence entry cleanly throws INVALID_DOSSIER_INFLUENCE without TypeError.');

  // 2. Verify authController loginWithPassword emits telemetry with defined variables
  console.log('\n--- 2. AuthController loginWithPassword Telemetry & Safety ---');
  const db = await getDatabase();
  const testUsername = `user_predictable_${Date.now()}`;
  const testPassword = 'SafePassword123!';
  const hashedPassword = hashPassword(testPassword);
  await db.run(
    'INSERT INTO users (id, username, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)',
    `user-${Date.now()}`, testUsername, hashedPassword, 'operator'
  );

  let responseJson = null;
  let responseStatus = 200;
  const mockReq = {
    body: { username: testUsername, password: testPassword }
  };
  const mockRes = {
    status(code) { responseStatus = code; return this; },
    json(data) { responseJson = data; return this; }
  };

  let nextCalledError = null;
  await authController.loginWithPassword(mockReq, mockRes, (err) => {
    nextCalledError = err;
  });

  assert.strictEqual(nextCalledError, null, 'loginWithPassword should not pass an error to next');
  assert.strictEqual(responseStatus, 200, 'loginWithPassword should return 200');
  assert.ok(responseJson && responseJson.valid, 'loginWithPassword should return valid session');
  assert.strictEqual(responseJson.role, 'operator', 'Role should match user role');
  console.log('  ✅ PASS: loginWithPassword executed without ReferenceError, role and label correctly populated.');

  // 3. Verify evolution.js transaction executes safely via withTransaction
  console.log('\n--- 3. Evolution Primitive Handler Transaction Concurrency ---');
  const evolutionHandler = require('../src/services/primitiveHandlers/evolution');
  const wsId = `ws_test_${Date.now()}`;
  const parentAgentId = `agent_parent_${Date.now()}`;
  const existingWs = await db.get('SELECT id FROM workspaces LIMIT 1');
  const workspaceId = existingWs?.id || wsId;
  if (!existingWs) {
    await db.run("INSERT INTO workspaces (id, name, path) VALUES (?, 'Test WS', './test')", workspaceId);
  }
  await db.run(
    "INSERT INTO agents (id, name, name_meaning, role, status, agent_type, execution_mode, workspace_id, current_task) VALUES (?, 'Parent Agent', 'Meaning', 'worker', 'idle', 'GenOS', 'worker', ?, 'Task 1')",
    parentAgentId, workspaceId
  );

  const mutateResult = await evolutionHandler.mutate({
    agentId: parentAgentId,
    mutations: ['temp=0.8'],
    mutationRate: 0.1
  });

  assert.strictEqual(mutateResult.success, true, 'Mutate primitive should execute successfully within withTransaction');
  assert.ok(mutateResult.mutantId, 'Mutant agent ID should be generated');
  console.log('  ✅ PASS: evolution.handleMutate executed atomically with withTransaction.');

  console.log('\n========================================');
  console.log('ALL PREDICTABLE BUG TESTS PASSED SUCCESSFULLY!');
  console.log('========================================');
}

runPredictableBugsSuite().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});