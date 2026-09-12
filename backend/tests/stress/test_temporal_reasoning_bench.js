/**
 * GenOS Temporal Reasoning Stress Benchmark
 * High-complexity temporal, causal, and counterfactual reasoning challenges:
 * 1. Counterfactual "What-If" Branching & Immutable Hash Fingerprinting
 * 2. O(log N) Causal Bisection Search Across 128 Snapshots
 * 3. Three-Way Causal State Reconciliation Across Divergent Timelines
 * 4. Non-Lossy Deterministic State Folding Across 100 Turns
 * 5. Downstream Topological Invalidation & Synaptic Graph Replay
 * 6. Multi-Horizon Future Worlds & Equivalence Verdicts
 */

const assert = require('assert');
const {
  causalDiff,
  causalMerge,
  stateFold,
  replayDependencies,
  dependencyMatrix
} = require('../../src/services/primitiveHandlers/temporal');
const {
  futureWorlds,
  similarity,
  equivalenceVerdict
} = require('../../src/services/primitiveHandlers/temporalEvaluation');
const { counterfactualReplay } = require('../../src/services/trajectoryService');
const { bisectAnomaly } = require('../../src/services/bisectionSearch');
const { getDatabase } = require('../../src/db');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result
        .then(() => {
          passed += 1;
          console.log(`  [PASS] ${name}`);
        })
        .catch((err) => {
          failed += 1;
          console.error(`  [FAIL] ${name}: ${err.message}`);
        });
    }
    passed += 1;
    console.log(`  [PASS] ${name}`);
    return Promise.resolve();
  } catch (err) {
    failed += 1;
    console.error(`  [FAIL] ${name}: ${err.message}`);
    return Promise.resolve();
  }
}

async function testCounterfactualBranching() {
  console.log('\n--- Challenge 1: Counterfactual "What-If" Branching & Causal Diff ---');
  console.log('  Competitor Failure: Linear chat histories cannot fork past states without data loss.');

  const originalTraj = {
    id: 'traj_db_migration_01',
    status: 'FAILURE',
    turns: [
      { step: 1, action: 'read_db_config', status: 'SUCCESS', pool: 5 },
      { step: 2, action: 'allocate_worker_threads', status: 'SUCCESS', threads: 8 },
      { step: 3, action: 'disable_tls_validation', status: 'SUCCESS', tls: false },
      { step: 4, action: 'execute_batch_write', status: 'FAILURE', error: 'TLS_SECURITY_VIOLATION' }
    ]
  };

  const intervention = {
    action: 'configure_tls_cert_pinning',
    status: 'SUCCESS',
    tls: true,
    error: null
  };

  const replay = counterfactualReplay(originalTraj, 3, intervention);

  await runTest('1.1 Original timeline history is preserved unmutated', () => {
    assert.strictEqual(originalTraj.turns.length, 4);
    assert.strictEqual(originalTraj.status, 'FAILURE');
    assert.strictEqual(originalTraj.turns[2].tls, false);
  });

  await runTest('1.2 Counterfactual timeline branches at step 3 with SHA-256 fingerprint', () => {
    assert.strictEqual(replay.branchingPoint, 3);
    assert.ok(replay.replayFingerprint && replay.replayFingerprint.length === 64);
    assert.strictEqual(replay.comparison.counterfactualTimeline.steps[2].action, 'configure_tls_cert_pinning');
    assert.strictEqual(replay.comparison.counterfactualTimeline.steps[2].tls, true);
    assert.strictEqual(replay.comparison.counterfactualTimeline.finalStatus, 'SUCCESS');
  });

  await runTest('1.3 CausalDiff isolates exact divergence between timelines', async () => {
    const diff = await causalDiff({
      baseline: originalTraj.turns,
      candidate: replay.comparison.counterfactualTimeline.steps
    });
    assert.strictEqual(diff.divergenceCount, 1);
    assert.strictEqual(diff.firstDivergenceStep, 2);
  });

  await runTest('1.4 Reject out-of-bounds branching points', () => {
    assert.throws(
      () => counterfactualReplay(originalTraj, 99, intervention),
      /stepIndex must be an integer between 1 and 4/
    );
  });
}

async function testCausalBisection() {
  console.log('\n--- Challenge 2: O(log N) Causal Bisection Across Historical Snapshots ---');
  console.log('  Competitor Failure: Standard frameworks iterate linearly or hallucinate regressions.');

  const snapshotCount = 128;
  const regressionStep = 53;
  const history = [];

  for (let i = 0; i < snapshotCount; i++) {
    history.push({
      step: i,
      hash: `snap_hash_${i.toString().padStart(3, '0')}`,
      healthy: i < regressionStep,
      reason: i === regressionStep ? 'Memory leak introduced in commit 53' : (i > regressionStep ? 'Cascading crash' : 'OK')
    });
  }

  await runTest('2.1 Isolate culprit snapshot in O(log N) iterations', () => {
    const res = bisectAnomaly(history, (s) => s.healthy);
    assert.strictEqual(res.bisectionComplete, true);
    assert.strictEqual(res.anomalyFound, true);
    assert.strictEqual(res.culpritReport.stepNumber, regressionStep);
    assert.ok(res.culpritReport.lastHealthy);
    assert.ok(res.culpritReport.lastHealthy.stepNumber < regressionStep);
    assert.ok(res.bisectionSteps <= Math.ceil(Math.log2(snapshotCount)));
  });

  await runTest('2.2 Return no-anomaly result when all snapshots satisfy invariant', () => {
    const cleanHistory = history.slice(0, 40);
    const res = bisectAnomaly(cleanHistory, () => true);
    assert.strictEqual(res.bisectionComplete, true);
    assert.strictEqual(res.anomalyFound, false);
    assert.strictEqual(res.reason, 'All available snapshots satisfy the invariant.');
  });

  await runTest('2.3 Non-monotonic history safely aborts to prevent false diagnosis', () => {
    const corruptHistory = [
      { step: 0, hash: 'h0', healthy: true },
      { step: 1, hash: 'h1', healthy: false },
      { step: 2, hash: 'h2', healthy: true }
    ];
    const res = bisectAnomaly(corruptHistory);
    assert.strictEqual(res.bisectionComplete, false);
    assert.ok(res.reason.includes('non-monotonic'));
  });
}

async function testThreeWayCausalMerge() {
  console.log('\n--- Challenge 3: Three-Way Causal State Reconciliation ---');
  console.log('  Competitor Failure: Blind last-write-wins overwrites concurrent timeline progress.');

  const base = {
    infrastructure: { instances: 2, region: 'us-east-1' },
    runtime: { cache: 'redis', maxWorkers: 4 },
    storage: { engine: 's3' }
  };

  const left = {
    infrastructure: { instances: 8, region: 'us-east-1' },
    runtime: { cache: 'redis', maxWorkers: 4 },
    storage: { engine: 's3' }
  };

  const right = {
    infrastructure: { instances: 2, region: 'us-east-1' },
    runtime: { cache: 'redis', maxWorkers: 16 },
    storage: { engine: 's3' }
  };

  await runTest('3.1 Reconcile non-overlapping mutations across branches with 0 conflicts', async () => {
    const res = await causalMerge({ base, left, right });
    assert.strictEqual(res.hasConflicts, false);
    assert.strictEqual(res.merged.infrastructure.instances, 8);
    assert.strictEqual(res.merged.runtime.maxWorkers, 16);
    assert.strictEqual(res.merged.storage.engine, 's3');
  });

  await runTest('3.2 Detect concurrent conflicting key mutation', async () => {
    const conflictingLeft = { ...left, runtime: { cache: 'valkey', maxWorkers: 4 } };
    const conflictingRight = { ...right, runtime: { cache: 'dragonfly', maxWorkers: 16 } };
    const res = await causalMerge({ base, left: conflictingLeft, right: conflictingRight });
    assert.strictEqual(res.hasConflicts, true);
    assert.ok(res.conflicts.some(c => c.key === 'runtime.cache'));
  });

  await runTest('3.3 Apply deterministic conflict resolution policy', async () => {
    const conflictingLeft = { ...left, runtime: { cache: 'valkey', maxWorkers: 4 } };
    const conflictingRight = { ...right, runtime: { cache: 'dragonfly', maxWorkers: 16 } };
    const res = await causalMerge({
      base,
      left: conflictingLeft,
      right: conflictingRight,
      conflictResolution: { 'runtime.cache': 'right' }
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.merged.runtime.cache, 'dragonfly');
  });
}

async function testStateFolding() {
  console.log('\n--- Challenge 4: Non-Lossy Deterministic State Folding Across 100 Turns ---');
  console.log('  Competitor Failure: FIFO memory truncates context, losing initial causal preconditions.');

  const turnCount = 100;
  const turns = [];
  for (let i = 0; i < turnCount; i++) {
    turns.push({
      step: i + 1,
      action: i % 2 === 0 ? 'patch_module' : 'validate_suite',
      file: `src/subsystems/module_${i % 5}.js`,
      statePatch: { [`param_${i % 10}`]: i * 10 },
      success: true
    });
  }

  await runTest('4.1 Fold 100 sequential micro-mutations into compact state', async () => {
    const res = await stateFold({ steps: turns });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.stepCount, 100);
    assert.strictEqual(res.foldedState.totalSteps, 100);
    assert.strictEqual(res.foldedState.isClean, true);
  });

  await runTest('4.2 Verify exact file deduplication and actions distribution', async () => {
    const res = await stateFold({ steps: turns });
    assert.strictEqual(res.foldedState.modifiedFiles.length, 5);
    assert.strictEqual(res.foldedState.actionsCount['patch_module'], 50);
    assert.strictEqual(res.foldedState.actionsCount['validate_suite'], 50);
  });

  await runTest('4.3 Detect dirty historic states with unvalidated steps', async () => {
    const dirtyTurns = [...turns, { step: 101, action: 'deploy', error: 'DEPLOY_REJECTED' }];
    const res = await stateFold({ steps: dirtyTurns });
    assert.strictEqual(res.foldedState.isClean, false);
    assert.strictEqual(res.foldedState.errorsEncountered, 1);
  });
}

async function testTopologicalDependencyReplay() {
  console.log('\n--- Challenge 5: Downstream Topological Invalidation & DAG Replay ---');
  console.log('  Competitor Failure: In forward-only RAG, altered past premises cause hallucination cascades.');

  const db = await getDatabase();
  const rootDecision = `dec_root_${Date.now()}`;
  const childA = `dec_child_a_${Date.now()}`;
  const childB = `dec_child_b_${Date.now()}`;
  const leafNode = `dec_leaf_${Date.now()}`;

  const insertNode = (id, title) =>
    db.run('INSERT INTO genome_decisions (id, title, content, created_by) VALUES (?, ?, ?, ?)', id, title, 'payload', 'bench_agent');

  await insertNode(rootDecision, 'Root Architecture Decision');
  await insertNode(childA, 'Child Implementation Decision A');
  await insertNode(childB, 'Child Implementation Decision B');
  await insertNode(leafNode, 'Leaf Verification Decision');

  await db.run('INSERT INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, ?)', rootDecision, childA, 0.9);
  await db.run('INSERT INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, ?)', rootDecision, childB, 0.85);
  await db.run('INSERT INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, ?)', childA, leafNode, 0.95);

  await runTest('5.1 Collect all downstream temporal descendants affected by root mutation', async () => {
    const res = await replayDependencies({ nodeId: rootDecision });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.rootNodeId, rootDecision);
    assert.strictEqual(res.affectedCount, 3);
    assert.ok(res.replayQueue.includes(childA));
    assert.ok(res.replayQueue.includes(childB));
    assert.ok(res.replayQueue.includes(leafNode));
  });

  await runTest('5.2 Leaf node alteration has 0 downstream invalidations', async () => {
    const res = await replayDependencies({ nodeId: leafNode });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.affectedCount, 0);
    assert.strictEqual(res.replayQueue.length, 0);
  });

  await runTest('5.3 Extract causal memory synaptic adjacency matrix', async () => {
    const res = await dependencyMatrix();
    assert.strictEqual(res.success, true);
    assert.ok(res.nodeCount >= 2);
    assert.ok(res.matrix[rootDecision]);
    assert.strictEqual(res.matrix[rootDecision][childA], 0.9);
  });
}

async function testFutureWorldsAndEquivalence() {
  console.log('\n--- Challenge 6: Multi-Horizon Future Worlds & Equivalence Verdicts ---');
  console.log('  Competitor Failure: Cannot project or evaluate semantic equivalence of hypothetical timelines.');

  await runTest('6.1 Generate probabilistic multi-horizon hypothetical worlds', async () => {
    const res = await futureWorlds({ branchCount: 4, horizonSteps: 5 });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.worldCount, 4);
    assert.strictEqual(res.worlds[0].expectedOutcome, 'OPTIMAL');
    assert.strictEqual(res.worlds[0].horizon, 5);
  });

  await runTest('6.2 Jaccard token similarity detects exact match', async () => {
    const left = { status: 'OPTIMAL', allocation: 100, cluster: 'primary' };
    const right = { status: 'OPTIMAL', allocation: 100, cluster: 'primary' };
    const sim = await similarity({ left, right });
    assert.strictEqual(sim.similarityScore, 1.0);
    assert.strictEqual(sim.metric, 'exact_match');
  });

  await runTest('6.3 Equivalence verdict approves convergent future predictions', async () => {
    const verdict = await equivalenceVerdict({ score: 0.94, threshold: 0.85 });
    assert.strictEqual(verdict.isEquivalent, true);
    assert.strictEqual(verdict.verdict, 'EQUIVALENT');
  });

  await runTest('6.4 Equivalence verdict rejects divergent future predictions', async () => {
    const verdict = await equivalenceVerdict({ score: 0.62, threshold: 0.85 });
    assert.strictEqual(verdict.isEquivalent, false);
    assert.strictEqual(verdict.verdict, 'DIVERGENT');
  });
}

async function main() {
  console.log('======================================================================');
  console.log('   GenOS Temporal Reasoning & Causal Replay Benchmark');
  console.log('======================================================================');

  await testCounterfactualBranching();
  await testCausalBisection();
  await testThreeWayCausalMerge();
  await testStateFolding();
  await testTopologicalDependencyReplay();
  await testFutureWorldsAndEquivalence();

  console.log('\n======================================================================');
  console.log(`TOTAL TEMPORAL REASONING TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
