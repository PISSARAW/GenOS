/**
 * Automated Test Suite for Golden Path Integrity & Replay
 * Validates fixes across trajectoryService, vectorMemoryService, agentMemoryContext,
 * primitiveHandlers, and strategyExecutionAdapter.
 */
const assert = require('assert');
const trajectoryService = require('../src/services/trajectoryService');
const vectorMemory = require('../src/services/vectorMemoryService');
const { formatGoldenPath, formatCognitiveMemoryPrompt } = require('../src/services/agentMemoryContext');
const memoryPrimitives = require('../src/services/primitiveHandlers/memory');
const temporalPrimitives = require('../src/services/primitiveHandlers/temporal');
const strategyExecutionAdapter = require('../src/services/strategyExecutionAdapter');
const { getDatabase } = require('../src/db');

async function runSuite() {
  console.log('=== RUNNING GOLDEN PATH INTEGRITY SUITE ===\n');

  // ----------------------------------------------------
  // POINT 1: goldenPath alias & approved status whitelist
  // ----------------------------------------------------
  console.log('[TEST 1] Testing goldenPath alias and approved status in trajectoryService...');
  const sampleTurns = [
    { step: 1, action: 'view_file', detail: 'Inspect entry point' },
    { step: 2, action: 'run_test', error: 'AssertionError', detail: 'Failed test' },
    { step: 3, action: 'replace_file_content', success: true, detail: 'Fixed bug' }
  ];
  const picked = trajectoryService.cherryPickGoldenPath(sampleTurns);
  assert.ok(Array.isArray(picked.goldenPathSteps), 'goldenPathSteps must be an array');
  assert.ok(Array.isArray(picked.goldenPath), 'goldenPath alias must be present as an array');
  assert.strictEqual(picked.goldenPath.length, 2, 'Must keep 2 non-dead-end steps');
  assert.strictEqual(picked.goldenPath, picked.goldenPathSteps, 'goldenPath must alias goldenPathSteps');

  const db = await getDatabase();
  const testTrajId = `traj_test_pt1_${Date.now()}`;
  const recResult = await trajectoryService.recordMissionTrajectory(db, {
    id: testTrajId,
    status: 'approved',
    task: 'Fix concurrency issue',
    turns: sampleTurns
  });
  assert.ok(recResult.success, 'recordMissionTrajectory should succeed');
  assert.strictEqual(recResult.status, 'approved', 'Status should be preserved as approved');
  console.log('-> Point 1 PASS: goldenPath alias and approved status valid.\n');

  // ----------------------------------------------------
  // POINT 2: Enhanced classifyTurn failure detection & allPruned warning
  // ----------------------------------------------------
  console.log('[TEST 2] Testing classifyTurn failure detection & allPruned warning...');
  const failureTurns = [
    { step: 1, action: 'build', success: false, detail: 'Build failed' },
    { step: 2, action: 'cmd', status: 'error', detail: 'Runtime error' },
    { step: 3, action: 'exec', exitCode: 1, detail: 'Exit code 1' },
    { step: 4, action: 'proc', code: 127, detail: 'Command not found' }
  ];
  for (const t of failureTurns) {
    const classified = trajectoryService.classifyTurn(t);
    assert.strictEqual(classified.classification, 'Dead-End', `Turn with ${JSON.stringify(t)} must be classified as Dead-End`);
  }

  const allDeadEndResult = trajectoryService.cherryPickGoldenPath(failureTurns);
  assert.strictEqual(allDeadEndResult.goldenPathSteps.length, 0, 'No steps should remain');
  assert.strictEqual(allDeadEndResult.allPruned, true, 'allPruned must be true when all steps are dead-ends');
  assert.ok(allDeadEndResult.warning, 'Warning message must be provided');
  console.log('-> Point 2 PASS: Failure detection and allPruned handling valid.\n');

  // ----------------------------------------------------
  // POINT 3: vectorMemory topSuccessfulGoldenPaths prioritization
  // ----------------------------------------------------
  console.log('[TEST 3] Testing vectorMemory topSuccessfulGoldenPaths categorization...');
  const gpDecisionId = `dec_gp_${Date.now()}`;
  const factDecisionId = `dec_fact_${Date.now()}`;
  await db.run(
    "INSERT OR REPLACE INTO genome_decisions (id, title, content, category, synaptic_weight, created_by) VALUES (?, ?, ?, ?, ?, ?)",
    gpDecisionId,
    'Refactor SQLite WAL Mode',
    JSON.stringify([{ step: 1, action: 'open' }, { step: 2, action: 'patch' }]),
    'GoldenPath',
    5.0,
    'agent_test'
  );
  await db.run(
    "INSERT OR REPLACE INTO genome_decisions (id, title, content, category, synaptic_weight, created_by) VALUES (?, ?, ?, ?, ?, ?)",
    factDecisionId,
    'General knowledge about SQLite',
    'SQLite is an in-process library that implements a self-contained SQL database engine.',
    'Fact',
    5.0,
    'agent_test'
  );

  const searchRes = await vectorMemory.searchMemory('SQLite WAL Mode', { limit: 5 }, db);
  assert.ok(Array.isArray(searchRes.topSuccessfulGoldenPaths), 'topSuccessfulGoldenPaths must be an array');
  assert.ok(searchRes.topSuccessfulGoldenPaths.length > 0, 'Should return golden paths');
  const allGpOrTraj = searchRes.topSuccessfulGoldenPaths.every(p => p.category === 'GoldenPath' || p.category === 'Trajectory');
  assert.ok(allGpOrTraj, 'All items in topSuccessfulGoldenPaths must be GoldenPath or Trajectory');
  const hasFactAsGp = searchRes.topSuccessfulGoldenPaths.some(p => p.category === 'Fact' || p.id === factDecisionId);
  assert.strictEqual(hasFactAsGp, false, 'Fact must not be categorized as a GoldenPath when true GoldenPath exists');
  console.log('-> Point 3 PASS: GoldenPath category prioritized properly.\n');

  // ----------------------------------------------------
  // POINT 4: Format Golden Path in agentMemoryContext prompt
  // ----------------------------------------------------
  console.log('[TEST 4] Testing formatGoldenPath and prompt generation...');
  const rawGpItem = {
    title: 'Safe parser patch',
    content: JSON.stringify([
      { step: 1, action: 'view_file', detail: 'Inspected index.js' },
      { step: 2, action: 'replace_file_content', detail: 'Added null-check' }
    ])
  };
  const formatted = formatGoldenPath(rawGpItem);
  assert.ok(!formatted.startsWith('[{'), 'Formatted golden path should not be raw JSON string');
  assert.ok(formatted.includes('1. [view_file] Inspected index.js'), 'Must contain step 1 flow');
  assert.ok(formatted.includes('2. [replace_file_content] Added null-check'), 'Must contain step 2 flow');
  assert.ok(formatted.includes('->'), 'Must use arrow flow connector');

  const promptBlock = await formatCognitiveMemoryPrompt('agent_test', 'Safe parser patch');
  assert.ok(typeof promptBlock === 'string', 'Prompt block must be a string');
  console.log('-> Point 4 PASS: Golden path prompt formatting clean.\n');

  // ----------------------------------------------------
  // POINT 5: Fallback turns and workspace synthesis in primitive handlers
  // ----------------------------------------------------
  console.log('[TEST 5] Testing primitive cherryPickGoldenPath without turns or workspace...');
  const autoResult = await memoryPrimitives.cherryPickGoldenPath({
    agentId: 'agent_synthesizer_test',
    task: 'Optimize memory indexing',
    reply: 'Created secondary b-tree index'
  });
  assert.ok(autoResult.success, 'Primitive cherryPickGoldenPath should succeed with synthesized turns');
  assert.strictEqual(autoResult.goldenPathSteps.length, 2, 'Synthesized turns should result in 2 steps');
  assert.ok(autoResult.trajectoryId, 'Trajectory ID must be generated and persisted');
  console.log('-> Point 5 PASS: Automatic turn synthesis and workspace resolution valid.\n');

  // ----------------------------------------------------
  // POINT 6: Counterfactual Replay through strategy adapter
  // ----------------------------------------------------
  console.log('[TEST 6] Testing strategyExecutionAdapter replay routing to counterfactualReplay...');
  const replayExecution = await strategyExecutionAdapter.executePipelineWithFeedback(
    ['golden_path_replay'],
    {
      trajectoryId: autoResult.trajectoryId,
      turns: [
        { step: 1, action: 'read', detail: 'Analyze bottlenecks' },
        { step: 2, action: 'patch', detail: 'Apply index' },
        { step: 3, action: 'verify', detail: 'Measure latency' }
      ],
      stepIndex: 2,
      alterations: { detail: 'Apply parallel hash-join instead of index' }
    }
  );
  assert.ok(replayExecution.success, 'Replay pipeline execution should succeed');
  const gpResult = replayExecution.results.find(r => r.primitive === 'golden_path_replay')?.result;
  assert.ok(gpResult?.success, 'golden_path_replay primitive result must succeed');
  const comp = gpResult.comparison;
  assert.ok(comp, 'Replay comparison object must be returned');
  assert.strictEqual(gpResult.branchingPoint, 2, 'Branching point must be 2');
  // Test counterfactual_replay primitive alias
  const cfExecution = await strategyExecutionAdapter.executePipelineWithFeedback(
    ['counterfactual_replay'],
    {
      trajectoryId: autoResult.trajectoryId,
      turns: [
        { step: 1, action: 'read', detail: 'Analyze bottlenecks' },
        { step: 2, action: 'patch', detail: 'Apply index' }
      ],
      stepIndex: 1,
      alterations: { detail: 'Alternative branch at step 1' }
    }
  );
  assert.ok(cfExecution.success, 'counterfactual_replay pipeline execution should succeed');
  const cfResult = cfExecution.results.find(r => r.primitive === 'counterfactual_replay')?.result;
  assert.ok(cfResult?.success, 'counterfactual_replay primitive result must succeed');
  assert.strictEqual(cfResult.branchingPoint, 1, 'Branching point must be 1');
  console.log('-> Point 6 PASS: Counterfactual replay integration verified.\n');

  console.log('=== ALL 6 GOLDEN PATH TESTS COMPLETED SUCCESSFULLY! ===');
}

runSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
