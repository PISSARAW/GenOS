/**
 * GenOS Test Suite: Automatic Causal Bisection in Worker Failure Recovery
 * Validates O(log N) isolation of culprit step, automated rollback, and
 * injection into recovery prompts and dispatch.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getDatabase, closeDatabase } = require('../src/db');
const bisectionService = require('../src/services/bisectionService');
const workerRecovery = require('../src/services/workerFailureRecoveryService');
const agentRecovery = require('../src/services/agentRecoveryService');
const telemetry = require('../src/services/telemetryObserver');
const { pendingWorkerRecoveries } = require('../src/services/agentOrchestrationState');

async function runSuite() {
  console.log('=== TEST 1 : Classification de Régression & Décision bisect_and_rollback ===');

  const testFailureEvent = {
    eventType: 'WORKER_TASK_FAILED',
    detail: 'npm test exited with code 1. AssertionError [ERR_ASSERTION]: Expected true to equal false in math_spec.ts',
    payload: {
      failure: {
        reason: 'npm test failed: 1 suite failed, 2 passed'
      }
    }
  };

  const category = workerRecovery.classifyFailure(testFailureEvent);
  assert.strictEqual(category, 'test_failure', `Expected 'test_failure', got '${category}'`);
  console.log('-> Cas 1.1 Validé : Échec de test classifié en test_failure.');

  const mission = {
    id: 'worker_task_regression_42',
    orchestratorAgentId: 'orch_prime_1',
    prompt: 'Implement neural attention layer and pass unit tests.',
    recoveryAttempt: 0,
    recoveryMaxAttempts: 3
  };

  const report = workerRecovery.failureReport(testFailureEvent, mission);
  assert.strictEqual(report.category, 'test_failure');

  const decision = workerRecovery.decideRecovery(report);
  assert.strictEqual(decision.action, 'bisect_and_rollback');
  assert.strictEqual(decision.retry, true);
  console.log('-> Cas 1.2 Validé : Décision automatique bisect_and_rollback.');

  console.log('=== TEST 2 : Algorithme O(log N) via autoBisectWorkspaceAnomaly ===');

  // Sequence of 8 steps where step 5 introduces the anomaly
  const snapshotTimeline = [
    { step: 1, hash: 'snap-1', healthy: true, label: 'Init project structure' },
    { step: 2, hash: 'snap-2', healthy: true, label: 'Add config and types' },
    { step: 3, hash: 'snap-3', healthy: true, label: 'Add tensor primitives' },
    { step: 4, hash: 'snap-4', healthy: true, label: 'Add activation functions' },
    { step: 5, hash: 'snap-5', healthy: false, label: 'Refactor matrix multiply with pointer offset bug' },
    { step: 6, hash: 'snap-6', healthy: false, label: 'Add softmax layer (inherits bug)' },
    { step: 7, hash: 'snap-7', healthy: false, label: 'Add loss function (inherits bug)' },
    { step: 8, hash: 'snap-8', healthy: false, label: 'Add integration benchmark (fails)' }
  ];

  const bisectResult = await bisectionService.autoBisectWorkspaceAnomaly(null, {
    workspaceId: 'ws-neural-core',
    snapshotHistory: snapshotTimeline,
    autoRollback: true
  });

  assert.strictEqual(bisectResult.bisectionComplete, true);
  assert.strictEqual(bisectResult.anomalyFound, true);
  assert.strictEqual(bisectResult.culpritReport.stepNumber, 5, `Expected culprit step 5, got ${bisectResult.culpritReport.stepNumber}`);
  assert.ok(
    bisectResult.bisectionIterationsRequired <= Math.ceil(Math.log2(snapshotTimeline.length)) + 1,
    `Bisection should require at most O(log N) iterations. Got ${bisectResult.bisectionIterationsRequired}`
  );
  assert.strictEqual(bisectResult.remediation.remediated, true);
  assert.strictEqual(bisectResult.remediation.rolledBackCulpritStep, 5);
  console.log(`-> Cas 2.1 Validé : Pas fautif #${bisectResult.culpritReport.stepNumber} isolé en ${bisectResult.bisectionIterationsRequired} itérations (O(log 8) = 3).`);
  console.log('-> Cas 2.2 Validé : Remédiation chirurgicale et rollback synthétisés.');

  console.log('=== TEST 3 : Injection du Diagnostic Causal dans le Prompt de Récupération ===');

  report.bisection = bisectResult;
  report.culpritReport = bisectResult.culpritReport;

  const generatedPrompt = workerRecovery.recoveryPrompt(report, decision);
  assert.ok(generatedPrompt.includes('DIAGNOSTIC BISECTION CAUSALE (O(log N)) :'), 'Prompt should include bisection section');
  assert.ok(generatedPrompt.includes('Pas fautif isolé : Étape 5'), 'Prompt should pinpoint step 5');
  assert.ok(generatedPrompt.includes('Ce pas fautif a été annulé par rollback chirurgical'), 'Prompt should warn not to repeat');
  console.log('-> Cas 3.1 Validé : Diagnostic causal et consigne de remédiation injectés avec succès.');

  console.log('=== TEST 4 : Intégration dans agentRecoveryService avec Événements Télémétriques ===');

  const tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-bisect-src-'));
  const tmpCapsules = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-bisect-capsules-'));
  fs.writeFileSync(path.join(tmpWorkspace, 'app.js'), 'console.log("isolated");\n');
  process.env.GENOS_CAPSULE_ROOT = tmpCapsules;

  const db = await getDatabase();
  const testWsId = `ws-bisect-${Date.now()}`;
  const testOrchId = `orch_bisect_${Date.now()}`;
  const testWorkerId = `worker_bisect_${Date.now()}`;

  // Seed database
  await db.run("INSERT OR REPLACE INTO workspaces (id, name, path) VALUES (?, 'Bisection Workspace', ?)", testWsId, tmpWorkspace);
  await db.run(
    "INSERT OR REPLACE INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id) VALUES (?, 'Orch Agent', 'orchestrator', 'running', 'GenOS', 'orchestrator', ?)",
    testOrchId, testWsId
  );
  await db.run(
    "INSERT OR REPLACE INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, parent_agent_id) VALUES (?, 'Worker Agent', 'coder', 'error', 'GenOS', 'worker', ?, ?)",
    testWorkerId, testWsId, testOrchId
  );

  // Insert snapshots in workspace_snapshots for the database-driven bisection test
  const dbSnapshots = [
    { id: `s1_${Date.now()}`, step: 1, healthy: true, label: 'Init repo' },
    { id: `s2_${Date.now()}`, step: 2, healthy: true, label: 'Add parser' },
    { id: `s3_${Date.now()}`, step: 3, healthy: true, label: 'Add lexer' },
    { id: `s4_${Date.now()}`, step: 4, healthy: false, label: 'Break token reader' },
    { id: `s5_${Date.now()}`, step: 5, healthy: false, label: 'Add AST' }
  ];

  for (const s of dbSnapshots) {
    await db.run(
      "INSERT INTO workspace_snapshots (id, workspace_id, snapshot_hash, step_number, label, author, reason, metadata) VALUES (?, ?, ?, ?, ?, 'test_author', ?, ?)",
      s.id, testWsId, `hash-${s.id}`, s.step, s.label, s.label, JSON.stringify({ healthy: s.healthy })
    );
  }

  // Queue recovery
  const queueResult = agentRecovery.queueWorkerRecovery({
    agentId: testWorkerId,
    orchestratorAgentId: testOrchId,
    workspaceId: testWsId,
    workspaceRoot: tmpWorkspace,
    originalMission: 'Parse grammar without crashing',
    recoveryAttempt: 0,
    recoveryMaxAttempts: 3
  }, {
    eventType: 'WORKER_TASK_FAILED',
    detail: 'npm test failed: Parse error at token reader',
    payload: {
      failure: { reason: 'exit code 1 from npm test' }
    }
  });

  assert.strictEqual(queueResult.queued, true);
  assert.strictEqual(queueResult.decision.action, 'bisect_and_rollback');
  console.log('-> Cas 4.1 Validé : Récupération mise en file avec bisect_and_rollback.');

  // Test dispatch
  let interceptedMission = null;
  const originalAdapter = require('../src/services/agentRuntimeAdapter');
  const originalStartMission = originalAdapter.startMission;
  originalAdapter.startMission = async (options) => {
    interceptedMission = options;
    return true;
  };

  try {
    const dispatched = await agentRecovery.dispatchWorkerRecovery(testWorkerId);
    assert.strictEqual(dispatched, true);
    assert.ok(interceptedMission != null, 'startMission should have been called');
    assert.ok(interceptedMission.prompt.includes('DIAGNOSTIC BISECTION CAUSALE (O(log N)) :'), 'Recovery prompt must contain bisection');
    assert.ok(interceptedMission.prompt.includes('Étape 4'), 'Culprit step 4 must be isolated from DB snapshots');
    assert.strictEqual(interceptedMission.culpritReport?.stepNumber, 4);

    // Verify telemetry event
    const bisectionEvents = telemetry.getRecentEvents(100, 'WORKER_CAUSAL_BISECTION_COMPLETED');
    assert.ok(bisectionEvents.length >= 1, 'Telemetry WORKER_CAUSAL_BISECTION_COMPLETED should be emitted');
    console.log(`-> Cas 4.2 Validé : Télémétrie émise et étape #4 isolée depuis la base SQLite.`);
  } finally {
    originalAdapter.startMission = originalStartMission;
    try {
      fs.rmSync(tmpWorkspace, { recursive: true, force: true });
      fs.rmSync(tmpCapsules, { recursive: true, force: true });
    } catch (_) {}
  }

  console.log('\n=============================================================');
  console.log('TOUS LES TESTS DE BISECTION CAUSALE AUTOMATIQUE ONT RÉUSSI !');
  console.log('=============================================================');
}

runSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
