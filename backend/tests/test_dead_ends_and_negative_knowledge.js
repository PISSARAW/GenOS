/**
 * Test Suite: Dead Ends, Negative Knowledge & Anti-Loop Primitives
 * Verifies:
 * 1. Failure persistence in memory & rejected trajectories
 * 2. avoid_known_dead_ends semantic vector scoring
 * 3. topPitfalls preservation in vectorMemory
 * 4. GraphRAG status integrity for Failure nodes
 * 5. MCTS skipping pruned nodes
 * 6. backpropagate ascending lineage tree
 * 7. message_graph & cycle_detection
 * 8. diagnose & hypothesis_evidence
 */

const assert = require('assert');
const { getDatabase } = require('../src/db');
const memoryPrimitives = require('../src/services/primitiveHandlers/memory');
const searchPrimitives = require('../src/services/primitiveHandlers/search');
const safetyPrimitives = require('../src/services/primitiveHandlers/safety');
const vectorMemory = require('../src/services/vectorMemoryService');
const trajectoryService = require('../src/services/trajectoryService');
const graphRag = require('../src/services/graphRagService');
const strategyAdapter = require('../src/services/strategyExecutionAdapter');

let passedTests = 0;

function pass(msg) {
  passedTests++;
  console.log(`  ? PASS: ${msg}`);
}

async function runDeadEndsSuite() {
  console.log('========================================================================');
  console.log('  TEST SUITE: DEAD ENDS, NEGATIVE KNOWLEDGE & RESILIENCE PRIMITIVES     ');
  console.log('========================================================================\n');

  const db = await getDatabase();

  // --- 1. Persistance des échecs et trajectoires rejetées ---
  console.log('--- 1. Persistance réelle des échecs & trajectoires rejetées ---');
  const failureId = `mem_fail_${Date.now()}`;
  await vectorMemory.storeMemory('worker-test', 'Recursive rewrite blew the stack budget in parseTree()', null, {
    id: failureId,
    category: 'Failure',
    title: 'Failure: Stack overflow in parser rewrite'
  });

  const failRow = await db.get('SELECT id, category, title, content FROM genome_decisions WHERE id = ?', failureId);
  assert.ok(failRow, 'Failure memory must be persisted in genome_decisions');
  assert.strictEqual(failRow.category, 'Failure', 'Category must be Failure');
  pass('Failure memory correctly persisted with category "Failure"');

  const trajRes = await trajectoryService.recordMissionTrajectory(db, {
    id: `traj_rej_${Date.now()}`,
    agentId: 'worker-test',
    task: 'Refactor parser without recursion limits',
    turns: [
      { step: 1, action: 'read_ast', success: true },
      { step: 2, action: 'recursive_transform', error: 'Maximum call stack size exceeded', status: 'error' }
    ],
    status: 'rejected'
  });
  assert.ok(trajRes && trajRes.success, 'Rejected trajectory recorded');
  const trajRow = await db.get('SELECT status, diff_lines FROM trajectories WHERE id = ?', trajRes.trajectoryId);
  assert.strictEqual(trajRow.status, 'rejected', 'Trajectory status must be rejected');
  pass('Failed mission recorded as rejected trajectory in database');

  // --- 2. avoid_known_dead_ends sémantique actif ---
  console.log('\n--- 2. avoid_known_dead_ends sémantique vectoriel ---');
  const similarContext = {
    task: 'Refactor parser with deep recursive AST transform',
    action: 'recursive rewrite of parseTree',
    threshold: 0.50
  };
  const avoidanceRisk = await memoryPrimitives.avoidKnownDeadEnds(similarContext);
  assert.strictEqual(avoidanceRisk.success, true);
  assert.strictEqual(avoidanceRisk.isDeadEndRisk, true, 'Similar task/action must trigger dead-end risk');
  assert.ok(avoidanceRisk.riskScore >= 0.50, 'Risk score must meet threshold');
  assert.ok(avoidanceRisk.warning, 'Warning message must be returned');
  pass(`Dead-end risk triggered (score: ${avoidanceRisk.riskScore}): "${avoidanceRisk.warning}"`);

  const safeContext = {
    task: 'Create CSS styling for navbar button',
    action: 'add tailwind css classes',
    threshold: 0.60
  };
  const safeAvoidance = await memoryPrimitives.avoidKnownDeadEnds(safeContext);
  assert.strictEqual(safeAvoidance.isDeadEndRisk, false, 'Unrelated task must not trigger dead-end risk');
  pass('Unrelated task cleared with isDeadEndRisk: false');

  // Test adapter invocation
  const adapterResult = await strategyAdapter.executePrimitive('avoid_known_dead_ends', similarContext);
  assert.strictEqual(adapterResult.isDeadEndRisk, true, 'Adapter must invoke avoidKnownDeadEnds correctly');
  pass('strategyAdapter.executePrimitive("avoid_known_dead_ends") works');

  // --- 3. Intégrité des Pitfalls dans vectorMemoryService ---
  console.log('\n--- 3. Intégrité des Pitfalls & non-éviction par les succès ---');
  for (let i = 0; i < 6; i++) {
    await vectorMemory.storeMemory('worker-test', `Optimal success solution ${i} for parser AST caching`, null, {
      id: `mem_succ_${Date.now()}_${i}`,
      category: 'Experience',
      title: `Success Solution ${i}`
    });
  }
  const searchMem = await vectorMemory.searchMemory('parser rewrite stack budget', { limit: 5 }, db);
  assert.ok(Array.isArray(searchMem.pitfallsToAvoid), 'pitfallsToAvoid must be an array');
  assert.ok(searchMem.pitfallsToAvoid.length > 0, 'pitfallsToAvoid must NOT be evicted by the 6 successes');
  assert.strictEqual(searchMem.pitfallsToAvoid[0].status, 'FAILURE', 'Pitfall item status must be FAILURE');
  pass('topPitfalls preserved directly from scored corpus despite 6 higher-scoring successes');

  // --- 4. Vérité du statut Failure dans GraphRAG ---
  console.log('\n--- 4. Vérité des statuts Failure dans GraphRAG ---');
  const anchorNode = {
    id: failureId,
    title: 'Failure: Stack overflow in parser rewrite',
    category: 'Failure',
    status: 'FAILURE',
    createdAt: new Date().toISOString()
  };
  const temporalRes = await graphRag.fetchTemporalAnchors([anchorNode], db);
  for (const item of temporalRes) {
    if (item.category === 'Failure') {
      assert.strictEqual(item.status, 'FAILURE', 'Temporal failure item must have status FAILURE');
    }
  }
  pass('GraphRAG correctly maps Failure category to status FAILURE instead of hardcoding SUCCESS');

  // --- 5. MCTS Select : Exclusion des nuds élagués ---
  console.log('\n--- 5. MCTS Select : Exclusion stricte des nuds élagués ---');
  const nodeAlive = `node_alive_${Date.now()}`;
  const nodePruned = `node_pruned_${Date.now()}`;

  await db.run(
    'INSERT INTO lineage_nodes (id, label, node_type, score, visits, metadata) VALUES (?, ?, ?, ?, ?, ?)',
    nodeAlive, 'Alive Node', 'agent', 0.5, 1, JSON.stringify({ pruned: false })
  );
  await db.run(
    'INSERT INTO lineage_nodes (id, label, node_type, score, visits, metadata) VALUES (?, ?, ?, ?, ?, ?)',
    nodePruned, 'Pruned Dead End Node', 'agent', 0.0, 0, JSON.stringify({ pruned: true, reason: 'Dead end' })
  );

  const mctsRes = await searchPrimitives.mctsSelect({
    candidates: [nodeAlive, nodePruned],
    explorationParam: 1.414
  });
  assert.strictEqual(mctsRes.success, true);
  assert.strictEqual(mctsRes.selectedNode.id, nodeAlive, 'MCTS must select alive node and ignore pruned node');
  assert.ok(!mctsRes.allScored.some(s => s.id === nodePruned), 'Pruned node must be excluded from scored candidates');
  pass('MCTS ignores pruned dead-end node even with 0 visits (avoids Infinity bug)');

  // --- 6. Backpropagate : Remontée du graphe de lignée & pénalité d\'échec ---
  console.log('\n--- 6. Primitive backpropagate : Remontée de lignée & pénalisation ---');
  const parentNodeId = `node_parent_${Date.now()}`;
  const childNodeId = `node_child_${Date.now()}`;

  await db.run(
    'INSERT INTO lineage_nodes (id, label, node_type, score, visits, metadata) VALUES (?, ?, ?, ?, ?, ?)',
    parentNodeId, 'Parent Strategy', 'fork', 1.0, 2, JSON.stringify({ failureCount: 0 })
  );
  await db.run(
    'INSERT INTO lineage_nodes (id, label, node_type, score, visits, metadata) VALUES (?, ?, ?, ?, ?, ?)',
    childNodeId, 'Child Action Branch', 'agent', 0.8, 1, JSON.stringify({ failureCount: 0 })
  );
  await db.run(
    'INSERT INTO lineage_edges (id, source_node_id, target_node_id, edge_type) VALUES (?, ?, ?, ?)',
    `edge_${Date.now()}`, parentNodeId, childNodeId, 'transition'
  );

  const backpropRes = await strategyAdapter.executePrimitive('backpropagate', {
    nodeId: childNodeId,
    rewardScore: -2.0,
    isFailure: true,
    pruneThreshold: 1
  });

  assert.strictEqual(backpropRes.success, true);
  assert.strictEqual(backpropRes.updatedCount, 2, 'Must update child and parent along edge');

  const updatedChild = await db.get('SELECT score, visits, metadata FROM lineage_nodes WHERE id = ?', childNodeId);
  const updatedParent = await db.get('SELECT score, visits, metadata FROM lineage_nodes WHERE id = ?', parentNodeId);

  assert.strictEqual(updatedChild.visits, 2, 'Child visits incremented');
  assert.strictEqual(updatedParent.visits, 3, 'Parent visits incremented');
  assert.ok(updatedChild.score < 0.8, 'Child score penalized by negative reward');
  assert.ok(updatedParent.score < 1.0, 'Parent score penalized by backpropagated failure');

  const childMeta = JSON.parse(updatedChild.metadata);
  assert.strictEqual(childMeta.pruned, true, 'Child node pruned after reaching pruneThreshold');
  pass('backpropagate successfully updated ancestors and pruned failing child node');

  // --- 7. Détection des boucles de communication (Ping-Pong & Outils) ---
  console.log('\n--- 7. Détection des boucles de communication (message_graph & cycle_detection) ---');
  const pingPongMessages = [
    { from: 'AgentA', to: 'AgentB', content: 'What is the parser status?' },
    { from: 'AgentB', to: 'AgentA', content: 'Checking AST...' },
    { from: 'AgentA', to: 'AgentB', content: 'What is the parser status?' },
    { from: 'AgentB', to: 'AgentA', content: 'Checking AST...' },
    { from: 'AgentA', to: 'AgentB', content: 'What is the parser status?' },
    { from: 'AgentB', to: 'AgentA', content: 'Checking AST...' }
  ];

  const graphRes = await strategyAdapter.executePrimitive('message_graph', { messages: pingPongMessages });
  assert.strictEqual(graphRes.success, true);
  assert.strictEqual(graphRes.nodes.length, 2, 'Two agent nodes in graph');
  assert.strictEqual(graphRes.edges.length, 2, 'Two directional edges');
  pass('message_graph generated communication topology');

  const cycleRes = await strategyAdapter.executePrimitive('cycle_detection', { messages: pingPongMessages, maxRepeats: 2 });
  assert.strictEqual(cycleRes.success, true);
  assert.strictEqual(cycleRes.hasCycle, true, 'Ping-pong exchange must be flagged as cycle');
  assert.strictEqual(cycleRes.loopType, 'agent_ping_pong');
  pass(`cycle_detection detected loop: ${cycleRes.loopType} with recommendation: "${cycleRes.recommendation}"`);

  const toolLoop = [
    { from: 'Coder', to: 'npm_test' },
    { from: 'Coder', to: 'npm_test' },
    { from: 'Coder', to: 'npm_test' }
  ];
  const toolCycle = await safetyPrimitives.cycleDetection({ messages: toolLoop, maxRepeats: 2 });
  assert.strictEqual(toolCycle.hasCycle, true, 'Repetitive tool execution must be flagged');
  assert.strictEqual(toolCycle.loopType, 'repetitive_action');
  pass('cycle_detection detected repetitive tool loop');

  // --- 8. Diagnostic et falsification d\'hypothèses ---
  console.log('\n--- 8. diagnose & hypothesis_evidence ---');
  const diagRes = await strategyAdapter.executePrimitive('diagnose', {
    task: 'Parser stack overflow crash',
    error: 'RangeError: Maximum call stack size exceeded in parseTree'
  });
  assert.strictEqual(diagRes.success, true);
  assert.ok(diagRes.hypotheses.length >= 3, 'Must generate falsifiable hypotheses');
  pass('diagnose generated falsifiable hypotheses');

  const hypoRes = await strategyAdapter.executePrimitive('hypothesis_evidence', {
    hypotheses: [
      { id: 'h1', statement: 'Issue caused by state invalidation', confidence: 0.7 },
      { id: 'h2', statement: 'Resource exhaustion memory error', confidence: 0.8 },
      { id: 'h3', statement: 'Syntax error in test file', confidence: 0.5 }
    ],
    evidence: [
      { statement: 'Syntax checker passed with no error', status: 'success' },
      { statement: 'Memory allocator reported no error', status: 'success' }
    ]
  });
  assert.strictEqual(hypoRes.success, true);
  assert.ok(hypoRes.falsifiedCount >= 2, 'Evidence must falsify contradictory hypotheses');
  assert.strictEqual(hypoRes.retainedCount, 1, 'Only unfalsified hypothesis retained');
  pass('hypothesis_evidence falsified contradicted hypotheses and preserved valid candidate');

  console.log(`\n========================================================================`);
  console.log(`  ALL ${passedTests} DEAD END & NEGATIVE KNOWLEDGE TESTS PASSED!`);
  console.log(`========================================================================\n`);
}

if (require.main === module) {
  runDeadEndsSuite()
    .then(() => {
      process.exit(0);
    })
    .catch(err => {
      console.error('Test failed with error:', err);
      process.exit(1);
    });
}

module.exports = { runDeadEndsSuite };
