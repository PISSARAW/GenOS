const assert = require('assert');
const { hypothesisEvidence, diagnose } = require('../src/services/primitiveHandlers/safetyHypothesis');

async function testPoint1() {
  console.log('--- Test Point 1: Falsification et Contre-exemples (safetyHypothesis) ---');

  // Test 1: Invariant hypothesis falsified by counterexample
  const invHyp = [{ id: 'hyp-inv-1', statement: 'Token validation invariant holds for all concurrent sessions', confidence: 0.9 }];
  const counterexampleEvidence = [
    {
      id: 'ev-1',
      counterexample: { token: 'expired-123', status: 200, error: 'Token accepted despite expiration' },
      detail: 'Failed: Token validation exception occurred. Assertion violation.'
    }
  ];

  const res1 = await hypothesisEvidence({ hypotheses: invHyp, evidence: counterexampleEvidence });
  assert.strictEqual(res1.falsifiedCount, 1, 'Invariant must be falsified by counterexample');
  assert.strictEqual(res1.retainedCount, 0, 'Invariant should not be retained');
  assert.strictEqual(res1.falsifiedHypotheses[0].confidence, 0.0);
  assert.ok(res1.falsifiedHypotheses[0].refutedBy.length > 0, 'Must record refutedBy');

  // Test 2: Invariant NOT falsified by passing evidence
  const passingEvidence = [
    { id: 'ev-2', detail: 'Token validation passed cleanly with 0 errors and healthy status' }
  ];
  const res2 = await hypothesisEvidence({ hypotheses: invHyp, evidence: passingEvidence });
  assert.strictEqual(res2.falsifiedCount, 0, 'Invariant must NOT be falsified by passing test');
  assert.strictEqual(res2.retainedCount, 1, 'Invariant must be retained when test passes');

  // Test 3: Bug hypothesis falsified by evidence confirming system is healthy
  const bugHyp = [{ id: 'hyp-bug-1', statement: 'Issue caused by cache corruption during database query', confidence: 0.8 }];
  const healthyEvidence = [
    { id: 'ev-3', detail: 'Cache query passed cleanly with 100% integrity and no error' }
  ];
  const res3 = await hypothesisEvidence({ hypotheses: bugHyp, evidence: healthyEvidence });
  assert.strictEqual(res3.falsifiedCount, 1, 'Bug hypothesis must be falsified if cache is healthy');
  assert.strictEqual(res3.retainedCount, 0);

  // Test 4: Explicit refutation targeting
  const explicitEvidence = [
    { id: 'ev-4', refutes: 'hyp-bug-1', detail: 'Formal proof of non-reproducibility' }
  ];
  const res4 = await hypothesisEvidence({ hypotheses: bugHyp, evidence: explicitEvidence });
  assert.strictEqual(res4.falsifiedCount, 1, 'Bug hypothesis must be falsified when explicitly refuted');

  console.log('  ✅ PASS: Point 1 falsification tests succeeded');
}

async function testPoint2() {
  console.log('--- Test Point 2: Pruning des impasses et Replay contrefactuel ---');
  const trajectoryService = require('../src/services/trajectoryService');
  const memoryPrimitives = require('../src/services/primitiveHandlers/memory');
  const { avoidKnownDeadEnds } = require('../src/services/primitiveHandlers/memoryDeadEnds');
  const { getDatabase } = require('../src/db');

  // 1. cherryPickGoldenPath returns deadEndSteps
  const sampleTurns = [
    { step: 1, action: 'scan', success: true },
    { step: 2, action: 'blow_stack', error: 'Recursion depth limit exceeded', success: false },
    { step: 3, action: 'guard_clause', success: true }
  ];
  const picked = trajectoryService.cherryPickGoldenPath(sampleTurns);
  assert.strictEqual(picked.goldenPathSteps.length, 2);
  assert.strictEqual(picked.deadEndSteps.length, 1);
  assert.strictEqual(picked.deadEndSteps[0].action, 'blow_stack');
  assert.strictEqual(picked.prunedSteps.length, 1);

  // 2. counterfactualReplay substitution & length
  const cf = trajectoryService.counterfactualReplay(
    { id: 'traj_test', turns: sampleTurns, status: 'FAILURE' },
    2,
    { action: 'iterative_loop', success: true, detail: 'Used iterative loop instead of recursion' }
  );
  assert.strictEqual(cf.comparison.counterfactualTimeline.steps.length, sampleTurns.length, 'Timeline steps length should match original');
  assert.strictEqual(cf.comparison.counterfactualTimeline.steps[1].action, 'iterative_loop', 'Step 2 must be replaced with alteration');
  assert.strictEqual(cf.comparison.counterfactualTimeline.steps[1].counterfactual, true);
  assert.strictEqual(cf.comparison.counterfactualTimeline.finalStatus, 'SUCCESS');
  const cfRepeat = trajectoryService.counterfactualReplay(
    { id: 'traj_test', turns: sampleTurns, status: 'FAILURE' },
    2,
    { action: 'iterative_loop', success: true, detail: 'Used iterative loop instead of recursion' }
  );
  assert.strictEqual(cf.replayId, cfRepeat.replayId, 'Identical replays must have identical IDs');
  assert.throws(() => trajectoryService.counterfactualReplay({ turns: sampleTurns }, 0, {}), /stepIndex must be an integer/);
  assert.throws(() => trajectoryService.counterfactualReplay({ turns: sampleTurns }, 4, {}), /stepIndex must be an integer/);

  // 3. Dual persistence of dead-ends as Failure in genome_decisions
  const db = await getDatabase();
  const deadEndAction = 'unsafe_buffer_overflow_attempt_' + Date.now();
  const rawTurnsWithDeadEnd = [
    { step: 1, action: 'init_safe', success: true },
    { step: 2, action: deadEndAction, error: 'Segmentation fault memory corruption', success: false },
    { step: 3, action: 'finish_safe', success: true }
  ];
  const resCherry = await memoryPrimitives.cherryPickGoldenPath({
    agentId: 'test_agent_ce',
    turns: rawTurnsWithDeadEnd,
    label: 'Test Golden Path with Dead End'
  });
  assert.ok(resCherry.success);
  assert.strictEqual(resCherry.deadEndSteps.length, 1);

  // Verify that avoidKnownDeadEnds detects the persisted failure
  const avoidRes = await avoidKnownDeadEnds({
    task: 'Execute memory operation',
    action: deadEndAction,
    threshold: 0.5
  });
  assert.strictEqual(avoidRes.isDeadEndRisk, true, 'Must detect dead end risk from persisted negative knowledge');
  assert.ok(avoidRes.riskScore >= 0.5);

  console.log('  ✅ PASS: Point 2 dead-end persistence & counterfactual replay tests succeeded');
}

async function testPoint3() {
  console.log('--- Test Point 3: Connectome GABAergique & Contre-Exemples ---');
  const { getDatabase } = require('../src/db');
  const memoryController = require('../src/controllers/memoryController');
  const vectorMemoryService = require('../src/services/vectorMemoryService');

  const db = await getDatabase();
  const testOrg = 'test-org-ce-' + Date.now();
  const testProj = 'test-proj-ce-' + Date.now();

  // 1. Ingest initial belief
  const req1 = {
    body: {
      title: 'Algorithm A performance invariant',
      content: 'Algorithm A is guaranteed optimal O(N) performance for all binary search trees',
      category: 'Experience',
      organizationId: testOrg,
      projectId: testProj
    },
    tenant: { organizationId: testOrg, projectId: testProj },
    headers: {}
  };
  let res1Data = null;
  const res1 = {
    status: () => ({
      json: (d) => { res1Data = d; }
    })
  };
  await memoryController.ingestMemory(req1, res1, (e) => { if (e) throw e; });
  assert.ok(res1Data && res1Data.id, 'Initial memory must be ingested');
  const initialDecisionId = res1Data.id;

  // 2. Ingest counterexample
  const req2 = {
    body: {
      title: 'Counterexample to Algorithm A invariant',
      content: 'Contre-exemple: sur les arbres dégénérés, Algorithme A s\'effondre en O(N^2) et viole l\'invariant',
      category: 'counterexample',
      organizationId: testOrg,
      projectId: testProj
    },
    tenant: { organizationId: testOrg, projectId: testProj },
    headers: {}
  };
  let res2Data = null;
  const res2 = {
    status: () => ({
      json: (d) => { res2Data = d; }
    })
  };
  await memoryController.ingestMemory(req2, res2, (e) => { if (e) throw e; });
  assert.ok(res2Data && res2Data.id, 'Counterexample must be ingested');
  const counterexampleId = res2Data.id;

  // 3. Verify GABAergic synapse with negative weight
  const synapse = await db.get(
    'SELECT * FROM memory_synapses WHERE source_id = ? AND target_id = ?',
    counterexampleId, initialDecisionId
  );
  assert.ok(synapse, 'GABAergic synapse must be created between counterexample and refuted belief');
  assert.strictEqual(synapse.transmitter_type, 'gaba');
  assert.ok(synapse.weight < 0, `Synaptic weight must be negative for GABAergic inhibition (got ${synapse.weight})`);

  // 4. Verify searchMemory marks refuted memory with inhibitorySignal = 'active'
  // even when queried by a DIFFERENT agent (not the creator)
  const searchResults = await vectorMemoryService.searchMemory(
    'Algorithm A optimal binary search tree',
    { organizationId: testOrg, projectId: testProj, ownerId: 'totally_different_worker_agent', limit: 10 },
    db
  );

  const foundRefuted = (searchResults.allScoredExperiences || []).find(e => e.id === initialDecisionId);
  assert.ok(foundRefuted, 'Initial memory should still be visible in scored experiences');
  assert.strictEqual(foundRefuted.inhibitorySignal, 'active', 'Refuted memory must have inhibitorySignal = active');

  // Verify refuted memory is excluded from topSuccessfulGoldenPaths
  const inGolden = (searchResults.topSuccessfulGoldenPaths || []).some(g => g.id === initialDecisionId);
  assert.strictEqual(inGolden, false, 'Inhibited memory must not be in topSuccessfulGoldenPaths');

  console.log('  ✅ PASS: Point 3 GABAergic inhibition & counterexample connectome tests succeeded');
}

async function runAll() {
  await testPoint1();
  await testPoint2();
  await testPoint3();
}

if (require.main === module) {
  runAll().catch(err => {
    console.error('Tests failed:', err);
    process.exit(1);
  });
}

module.exports = { testPoint1, testPoint2, testPoint3 };


