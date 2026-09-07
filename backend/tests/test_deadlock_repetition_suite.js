/**
 * Test Suite: Deadlock and Repetition Prevention Verification
 * Validates fixes for points 1 through 9.
 */

const assert = require('assert');
const { getDatabase, withTransaction } = require('../src/db');
const { calculateShannonEntropy, detectDeadlocks } = require('../src/services/swarmMetricsService');
const swarmSentinel = require('../src/services/swarmSentinelService');
const { evaluateCognitiveHealth } = require('../src/services/cognitiveMonitor');
const circuitBreaker = require('../src/services/circuitBreaker');
const safetyPrimitives = require('../src/services/primitiveHandlers/safety');
const { waitForAutonomousWorkerQuiescence } = require('../src/services/agentFleetService');

async function testPoint1_TransactionSerialization() {
  console.log('\n--- 1. Point 1: Concurrent withTransaction Serialization ---');
  const db = await getDatabase();

  const results = [];
  const p1 = withTransaction(db, async () => {
    await new Promise((r) => setTimeout(r, 50));
    results.push('tx1');
    return 'r1';
  });

  const p2 = withTransaction(db, async () => {
    results.push('tx2');
    return 'r2';
  });

  const [res1, res2] = await Promise.all([p1, p2]);
  assert.strictEqual(res1, 'r1');
  assert.strictEqual(res2, 'r2');
  assert.deepStrictEqual(results, ['tx1', 'tx2'], 'Transactions must execute sequentially without collision');
  console.log('  PASS: Concurrent withTransaction calls serialized cleanly without SQLite deadlock.');
}

async function testPoint2_ShannonAlternatingLoops() {
  console.log('\n--- 2. Point 2: Shannon Entropy Alternating Loop Detection ---');
  const alternating = ['tool:read', 'tool:edit', 'tool:read', 'tool:edit'];
  const metrics = calculateShannonEntropy(alternating);

  assert.strictEqual(metrics.cognitiveDriftState, 'COLLAPSE_DEADLOCK', 'Alternating loop must be classified as COLLAPSE_DEADLOCK');
  assert.strictEqual(metrics.isPeriodicCycle, true, 'isPeriodicCycle must be true');
  assert.strictEqual(metrics.cycleLength, 2, 'cycleLength must be 2');
  assert.strictEqual(metrics.normalizedEntropy, 0, 'normalizedEntropy must collapse to 0 on periodic deadlock');
  console.log('  PASS: Alternating A <-> B loop correctly flagged as COLLAPSE_DEADLOCK with normalizedEntropy 0.0.');
}

async function testPoint3_SentinelAndGraphDeduplication() {
  console.log('\n--- 3. Point 3: Message Deadlock Sentinel & Graph Deduplication ---');
  const duplicateMessages = [
    { sender: 'agent_A', recipient: 'agent_B', hasDiff: false },
    { sender: 'agent_A', recipient: 'agent_B', hasDiff: false },
    { sender: 'agent_B', recipient: 'agent_A', hasDiff: false },
    { sender: 'agent_B', recipient: 'agent_A', hasDiff: false },
    { sender: 'agent_A', recipient: 'agent_B', hasDiff: false },
    { sender: 'agent_B', recipient: 'agent_A', hasDiff: false },
    { sender: 'agent_A', recipient: 'agent_B', hasDiff: false },
  ];

  const deadlockResult = detectDeadlocks(duplicateMessages, 6);
  assert.strictEqual(deadlockResult.deadlockDetected, true);
  assert.strictEqual(deadlockResult.chattyLoops.length, 1, 'Only one chatty loop entry for the pair');
  
  const interactionRes = swarmSentinel.recordInteraction('agent_X', 'agent_Y', false);
  assert.ok(interactionRes !== undefined);
  console.log('  PASS: detectDeadlocks deduplicates graph edges and recordInteraction evaluates inter-agent chatter.');
}

async function testPoint4_CliLoopDetection() {
  console.log('\n--- 4. Point 4: genos loop-detection CLI ---');
  const { execSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const tempFile = path.join(os.tmpdir(), `history_test_${Date.now()}.jsonl`);
  fs.writeFileSync(tempFile, 'action_a\naction_a\naction_a\naction_a\n');

  try {
    const cargoRun = execSync(
      `cargo run --quiet -p genos-cli -- loop-detection --history-file "${tempFile}" --exact-match 3`,
      { cwd: path.resolve(__dirname, '../../'), encoding: 'utf8' }
    );
    const parsed = JSON.parse(cargoRun);
    assert.strictEqual(parsed.loop_detected, true, 'Exact match loop must be detected by CLI');
    assert.strictEqual(parsed.loop_type, 'EXACT_MATCH_REPETITION');
    assert.strictEqual(parsed.recommendation, 'BREAK_LOOP_OR_HALT');
    console.log('  PASS: CLI loop-detection accurately parses history and flags exact match repetition.');
  } finally {
    try { fs.unlinkSync(tempFile); } catch (_) {}
  }
}

async function testPoint5_CognitiveMonitorEnglishStopwords() {
  console.log('\n--- 5. Point 5: Bilingual Stopwords & Immune Prompt Steering ---');
  const technicalEnglish = 'The error occurred because the configuration was failed and the system was unable to load the file';
  const health = evaluateCognitiveHealth(technicalEnglish);

  assert.strictEqual(health.health_score, 1.0, 'Technical English words should not trigger repetition collapse');
  assert.strictEqual(health.repetition_score, 0, 'Repetition score should be 0 for diverse technical English');
  console.log('  PASS: English stopwords prevent false positive repetition anomalies.');
}

async function testPoint6_SafetyCycleDetectionCoercive() {
  console.log('\n--- 6. Point 6: Coercive cycleDetection Action & Budget Penalty ---');
  const messages = [
    { from: 'agent_1', to: 'agent_2' },
    { from: 'agent_2', to: 'agent_1' },
    { from: 'agent_1', to: 'agent_2' },
    { from: 'agent_2', to: 'agent_1' },
    { from: 'agent_1', to: 'agent_2' }
  ];

  const res = await safetyPrimitives.cycleDetection({ messages, maxRepeats: 2 });
  assert.strictEqual(res.hasCycle, true);
  assert.strictEqual(res.action, 'BREAK_LOOP', 'Action must be BREAK_LOOP');
  assert.strictEqual(res.intervention, true, 'Intervention flag must be true');
  console.log('  PASS: cycleDetection returns BREAK_LOOP action and intervention flag.');
}

async function testPoint7_WorkerQuiescenceFastFail() {
  console.log('\n--- 7. Point 7: Worker Quiescence Barrier Fast Fail on Missing Worker ---');
  const fakeDb = {
    async all() {
      return [];
    }
  };

  const start = Date.now();
  let caught = null;
  try {
    await waitForAutonomousWorkerQuiescence(
      fakeDb,
      'orchestrator-test',
      ['ghost-worker-1'],
      { timeoutMs: 5000, pollMs: 10 }
    );
  } catch (err) {
    caught = err;
  }
  const duration = Date.now() - start;

  assert.ok(caught, 'Must throw error on missing worker');
  assert.strictEqual(caught.code, 'WORKER_NOT_FOUND', 'Error code must be WORKER_NOT_FOUND');
  assert.ok(duration < 4000, `Must fail fast (took ${duration}ms < 4000ms instead of 14 minutes)`);
  console.log(`  PASS: Barrier failed fast in ${duration}ms with WORKER_NOT_FOUND instead of blocking for 14 minutes.`);
}

async function testPoint8_CircuitBreakerToolLoopTrip() {
  console.log('\n--- 8. Point 8: Circuit Breaker Non-Destructive Tool Loop Trip ---');
  const scope = 'test_loop_scope_' + Date.now();

  for (let i = 0; i < 5; i++) {
    const res = circuitBreaker.canExecute('get_status', 'viewer', scope, { id: 'x' });
    assert.strictEqual(res.allowed, true, `Call ${i + 1} should be allowed`);
  }

  const tripped = circuitBreaker.canExecute('get_status', 'viewer', scope, { id: 'x' });
  assert.strictEqual(tripped.allowed, false, '6th identical call must be blocked');
  assert.strictEqual(tripped.reason, 'TOOL_EXECUTION_LOOP');
  console.log('  PASS: Circuit breaker blocked 6th consecutive identical read tool invocation.');
}

async function runAll() {
  console.log('===============================================================');
  console.log('      DEADLOCK & REPETITION RESOLUTION VERIFICATION SUITE       ');
  console.log('===============================================================');

  await testPoint1_TransactionSerialization();
  await testPoint2_ShannonAlternatingLoops();
  await testPoint3_SentinelAndGraphDeduplication();
  await testPoint4_CliLoopDetection();
  await testPoint5_CognitiveMonitorEnglishStopwords();
  await testPoint6_SafetyCycleDetectionCoercive();
  await testPoint7_WorkerQuiescenceFastFail();
  await testPoint8_CircuitBreakerToolLoopTrip();

  console.log('\n===============================================================');
  console.log('      ALL DEADLOCK & REPETITION TESTS PASSED SUCCESSFULLY!     ');
  console.log('===============================================================');
}

runAll().catch((err) => {
  console.error('\nFAILED: Test suite error:', err);
  process.exit(1);
});
