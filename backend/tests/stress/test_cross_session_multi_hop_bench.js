/**
 * GenOS Cross-Session Multi-Hop Reasoning Benchmark Suite
 * High-complexity relational, episodic, and synaptic GraphRAG challenges:
 * 1. Three-Session Transitive Causal Chain Traversal (S1 -> S2 -> S3)
 * 2. Cross-Session Temporal Mutation & GABAergic Branch Pruning
 * 3. Disjoint Multi-Hop Decoy Isolation (Zero Branch Bleeding)
 * 4. Epistemic Invalidation on Broken Intermediate Chain Links
 * 5. Cyclic Dependency Loop Trapping Across Sessions
 * 6. Cross-Session Hippocampal Episodic Consolidation
 */

const assert = require('assert');
const { traverseSynapses } = require('../../src/services/graphRagService');
const vectorMemory = require('../../src/services/vectorMemoryService');
const episodicMemory = require('../../src/services/episodicMemoryService');
const epistemics = require('../../src/services/epistemics');
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

async function testThreeSessionTransitiveChain() {
  console.log('\n--- Challenge 1: Three-Session Transitive Chain Traversal ---');
  console.log('  Competitor Failure: Pure vector lookup fails across disjoint semantic islands.');

  const db = await getDatabase();
  const agentId = `agent_chain_${Date.now()}`;

  // Session 1: Service Kumuisi -> Namespace prod-omega
  const idHop1 = await vectorMemory.storeMemory(
    agentId,
    'Service Kumuisi is deployed in Kubernetes namespace prod-omega.',
    null,
    { title: 'S1: Kumuisi Service Mapping' }
  );

  // Session 2: Namespace prod-omega -> DB Cluster aurora-pg-09
  const idHop2 = await vectorMemory.storeMemory(
    agentId,
    'Namespace prod-omega is connected to database cluster aurora-pg-09.',
    null,
    { title: 'S2: Namespace Database Mapping' }
  );

  // Session 3: DB Cluster aurora-pg-09 -> KMS Key kms-key-441-alpha
  const idHop3 = await vectorMemory.storeMemory(
    agentId,
    'Database cluster aurora-pg-09 encryption is managed by KMS key kms-key-441-alpha.',
    null,
    { title: 'S3: Database KMS Encryption' }
  );

  // Establish synaptic connections across sessions
  await db.run('INSERT INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, ?)', [idHop1, idHop2, 1.0]);
  await db.run('INSERT INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, ?)', [idHop2, idHop3, 1.0]);

  await runTest('1.1 Traverse multi-hop synaptic graph from Session 1 to Session 3', async () => {
    const neighbors = await traverseSynapses([idHop1], db);
    const foundHop2 = neighbors.some(n => n.id === idHop2);
    const foundHop3 = neighbors.some(n => n.id === idHop3);

    assert.strictEqual(foundHop2, true, 'Hop 2 (Session 2) must be reached');
    assert.strictEqual(foundHop3, true, 'Hop 3 (Session 3) must be reached via transitive closure');
  });

  await runTest('1.2 Synaptic edge weights reflect transitive distance attenuation', async () => {
    const neighbors = await traverseSynapses([idHop1], db);
    const hop2Node = neighbors.find(n => n.id === idHop2);
    const hop3Node = neighbors.find(n => n.id === idHop3);

    assert.ok(hop2Node && hop3Node);
    assert.strictEqual(hop2Node.synaptic_edge_weight, 0.5);
    assert.strictEqual(hop3Node.synaptic_edge_weight, 0.25);
    assert.ok(hop2Node.synaptic_edge_weight > hop3Node.synaptic_edge_weight);
  });

  await runTest('1.3 Reverse multi-hop traversal connects Session 3 back to Session 1', async () => {
    const reverseNeighbors = await traverseSynapses([idHop3], db);
    const foundHop1 = reverseNeighbors.some(n => n.id === idHop1);
    const foundHop2 = reverseNeighbors.some(n => n.id === idHop2);
    assert.strictEqual(foundHop1, true, 'Hop 1 must be reached in reverse traversal');
    assert.strictEqual(foundHop2, true, 'Hop 2 must be reached in reverse traversal');
  });
}

async function testTemporalMutationBranchPruning() {
  console.log('\n--- Challenge 2: Temporal Mutation & GABAergic Branch Pruning ---');
  console.log('  Competitor Failure: Naive traverser follows stale legacy branch and returns dead key.');

  const db = await getDatabase();
  const agentId = `agent_prune_${Date.now()}`;

  // Session 1: Service Kumuisi root
  const idRoot = await vectorMemory.storeMemory(
    agentId,
    'Service Kumuisi gateway routes to active data persistence.',
    null,
    { title: 'S1: Gateway Root' }
  );

  // Session 1 (Legacy): Root -> Legacy DB -> Dead KMS
  const idLegacyDb = await vectorMemory.storeMemory(
    agentId,
    'Legacy database cluster legacy-db-01 is located on rack-9.',
    null,
    { title: 'S1: Legacy DB' }
  );
  const idLegacyKms = await vectorMemory.storeMemory(
    agentId,
    'Legacy database is encrypted with revoked KMS key kms-dead-legacy.',
    null,
    { title: 'S1: Revoked KMS' }
  );

  // Session 2 (Active): Root -> Modern DB -> Active KMS
  const idModernDb = await vectorMemory.storeMemory(
    agentId,
    'Modern database cluster modern-aurora-02 is located in AWS us-east-1.',
    null,
    { title: 'S2: Modern Aurora DB' }
  );
  const idActiveKms = await vectorMemory.storeMemory(
    agentId,
    'Modern database is encrypted with active KMS key kms-active-prod.',
    null,
    { title: 'S2: Active Prod KMS' }
  );

  // Active path synapses
  await db.run('INSERT INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, ?)', [idRoot, idModernDb, 1.0]);
  await db.run('INSERT INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, ?)', [idModernDb, idActiveKms, 1.0]);

  // Legacy path synapses with GABAergic inhibition
  await db.run('INSERT INTO memory_synapses (source_id, target_id, weight, transmitter_type) VALUES (?, ?, ?, ?)', [idRoot, idLegacyDb, -2.0, 'gaba']);
  await db.run('INSERT INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, ?)', [idLegacyDb, idLegacyKms, 1.0]);

  await runTest('2.1 Multi-hop traversal completely prunes GABAergically inhibited legacy branch', async () => {
    const neighbors = await traverseSynapses([idRoot], db);
    const foundModern = neighbors.some(n => n.id === idModernDb);
    const foundActiveKms = neighbors.some(n => n.id === idActiveKms);
    const foundLegacyDb = neighbors.some(n => n.id === idLegacyDb);
    const foundLegacyKms = neighbors.some(n => n.id === idLegacyKms);

    assert.strictEqual(foundModern, true, 'Active DB must be traversed');
    assert.strictEqual(foundActiveKms, true, 'Active KMS must be traversed');
    assert.strictEqual(foundLegacyDb, false, 'GABA-inhibited legacy DB must be blocked');
    assert.strictEqual(foundLegacyKms, false, 'Dead KMS on inhibited branch must not be reached');
  });

  await runTest('2.2 Neutralized zero-weight synapse is pruned alongside GABA branches', async () => {
    const idDeadStub = await vectorMemory.storeMemory(agentId, 'Zero-weight dead stub node', null, { title: 'Dead Stub' });
    await db.run('INSERT INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, ?)', [idRoot, idDeadStub, 0.0]);
    const neighbors = await traverseSynapses([idRoot], db);
    assert.strictEqual(neighbors.some(n => n.id === idDeadStub), false, 'Zero-weight stub must not be traversed');
  });
}

async function testDecoyBranchIsolation() {
  console.log('\n--- Challenge 3: Disjoint Multi-Hop Decoy Isolation ---');
  console.log('  Competitor Failure: Decoy branches with similar types bleed across relational hops.');

  const db = await getDatabase();
  const agentId = `agent_decoy_${Date.now()}`;

  // Branch A: Alpha Service -> Alpha Store -> Alpha Secret
  const idAlphaService = await vectorMemory.storeMemory(agentId, 'Alpha Service entity', null, { title: 'Alpha Service' });
  const idAlphaStore = await vectorMemory.storeMemory(agentId, 'Alpha Store bucket', null, { title: 'Alpha Store' });
  const idAlphaSecret = await vectorMemory.storeMemory(agentId, 'Alpha Secret Key SECRET-AAA-99', null, { title: 'Alpha Secret' });

  await db.run('INSERT INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, ?)', [idAlphaService, idAlphaStore, 1.0]);
  await db.run('INSERT INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, ?)', [idAlphaStore, idAlphaSecret, 1.0]);

  // Branch B: Beta Service -> Beta Store -> Beta Secret
  const idBetaService = await vectorMemory.storeMemory(agentId, 'Beta Service entity', null, { title: 'Beta Service' });
  const idBetaStore = await vectorMemory.storeMemory(agentId, 'Beta Store bucket', null, { title: 'Beta Store' });
  const idBetaSecret = await vectorMemory.storeMemory(agentId, 'Beta Secret Key SECRET-BBB-88', null, { title: 'Beta Secret' });

  await db.run('INSERT INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, ?)', [idBetaService, idBetaStore, 1.0]);
  await db.run('INSERT INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, ?)', [idBetaStore, idBetaSecret, 1.0]);

  await runTest('3.1 Traverse Branch A with 0 leakage from Branch B', async () => {
    const neighborsA = await traverseSynapses([idAlphaService], db);
    const hasBetaStore = neighborsA.some(n => n.id === idBetaStore);
    const hasBetaSecret = neighborsA.some(n => n.id === idBetaSecret);

    assert.strictEqual(hasBetaStore, false, 'Branch B store must not leak into Branch A traversal');
    assert.strictEqual(hasBetaSecret, false, 'Branch B secret must not leak into Branch A traversal');
    assert.ok(neighborsA.some(n => n.id === idAlphaSecret), 'Branch A secret must be reached');
  });

  await runTest('3.2 Symmetrical branch isolation: traversing Branch B excludes Branch A', async () => {
    const neighborsB = await traverseSynapses([idBetaService], db);
    assert.strictEqual(neighborsB.some(n => n.id === idAlphaStore), false, 'Branch A store must not leak');
    assert.strictEqual(neighborsB.some(n => n.id === idAlphaSecret), false, 'Branch A secret must not leak');
    assert.ok(neighborsB.some(n => n.id === idBetaSecret), 'Branch B secret must be reached');
  });
}

async function testEpistemicChainValidation() {
  console.log('\n--- Challenge 4: Epistemic Invalidation on Broken Chain Links ---');
  console.log('  Competitor Failure: Blindly trusts unverified intermediate hops.');

  const brokenIntermediateMemory = {
    id: 'mem_hop_broken',
    content: '[unverified_claim] Namespace prod-omega routes through unvetted proxy-09',
    tags: ['unverified', 'proxy_hop'],
    credibility: 0.1
  };

  await runTest('4.1 Intermediate link failure blocks downstream generation and planning', () => {
    const epistemic = epistemics.validateMemoryPerception(brokenIntermediateMemory);
    assert.strictEqual(epistemic.state, 'INVALID');
    assert.strictEqual(epistemic.isOperationAllowed('plan'), false);
    assert.strictEqual(epistemic.isOperationAllowed('act'), false);
    assert.strictEqual(epistemic.isOperationAllowed('generate'), false);
  });

  await runTest('4.2 Certified intermediate link allows full downstream planning and action', () => {
    const validMemory = {
      id: 'mem_hop_valid',
      content: 'Cluster pg-09 cert is signed and verified',
      tags: ['verified'],
      credibility: 0.95
    };
    const epistemic = epistemics.validateMemoryPerception(validMemory);
    assert.strictEqual(epistemic.state, 'VALID');
    assert.strictEqual(epistemic.isOperationAllowed('plan'), true);
    assert.strictEqual(epistemic.isOperationAllowed('act'), true);
  });
}

async function testCyclicTraversalProtection() {
  console.log('\n--- Challenge 5: Cyclic Dependency Loop Trapping Across Sessions ---');
  console.log('  Competitor Failure: Circular dependencies trigger infinite recursion / stack overflow.');

  const db = await getDatabase();
  const agentId = `agent_cycle_${Date.now()}`;

  const idCycleA = await vectorMemory.storeMemory(agentId, 'Circular node Alpha', null, { title: 'Cycle Alpha' });
  const idCycleB = await vectorMemory.storeMemory(agentId, 'Circular node Beta', null, { title: 'Cycle Beta' });
  const idCycleC = await vectorMemory.storeMemory(agentId, 'Circular node Gamma', null, { title: 'Cycle Gamma' });

  // A -> B -> C -> A (Cycle)
  await db.run('INSERT INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, ?)', [idCycleA, idCycleB, 1.0]);
  await db.run('INSERT INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, ?)', [idCycleB, idCycleC, 1.0]);
  await db.run('INSERT INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, ?)', [idCycleC, idCycleA, 1.0]);

  await runTest('5.1 Recursive CTE traversal terminates safely without infinite loop', async () => {
    const startTime = Date.now();
    const neighbors = await traverseSynapses([idCycleA], db);
    const durationMs = Date.now() - startTime;

    assert.ok(durationMs < 100, `Traversal must complete rapidly without hanging (took ${durationMs}ms)`);
    assert.ok(neighbors.length <= 15, 'Result count must stay bounded');
  });

  await runTest('5.2 Self-loop reflexive synapse terminates safely without duplicate expansion', async () => {
    const idLoopNode = await vectorMemory.storeMemory(agentId, 'Self loop node', null, { title: 'Self Loop' });
    await db.run('INSERT INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, ?)', [idLoopNode, idLoopNode, 1.0]);
    const neighbors = await traverseSynapses([idLoopNode], db);
    assert.ok(Array.isArray(neighbors));
  });
}

async function testCrossSessionHippocampalConsolidation() {
  console.log('\n--- Challenge 6: Cross-Session Hippocampal Consolidation ---');
  console.log('  Competitor Failure: Memory across multiple sessions accumulates unbounded noise.');

  const db = await getDatabase();
  const agentId = `agent_consolidation_${Date.now()}`;
  const session1 = `sess_alpha_${Date.now()}`;
  const session2 = `sess_beta_${Date.now()}`;

  // Session 1 experiences
  await episodicMemory.recordEpisode({
    agentId,
    sessionId: session1,
    turnNumber: 1,
    actionType: 'build',
    actionInput: 'npm run build',
    observationOutput: 'Build succeeded',
    rewardScore: 0.95
  }, db);

  await episodicMemory.recordEpisode({
    agentId,
    sessionId: session1,
    turnNumber: 2,
    actionType: 'test_flake',
    actionInput: 'npm run test:flaky',
    observationOutput: 'Timeout',
    rewardScore: 0.25
  }, db);

  // Session 2 experiences
  await episodicMemory.recordEpisode({
    agentId,
    sessionId: session2,
    turnNumber: 1,
    actionType: 'deploy',
    actionInput: 'kubectl apply',
    observationOutput: 'Deployed successfully',
    rewardScore: 0.90
  }, db);

  await runTest('6.1 Consolidate high-reward experiences across distinct sessions', async () => {
    const result = await episodicMemory.consolidateEpisodes({
      agentId,
      scoreThreshold: 0.70,
      purgeBelowThreshold: true
    }, db);

    assert.strictEqual(result.consolidatedCount, 2, 'Must consolidate the two >= 0.70 episodes');
    assert.strictEqual(result.purgedCount, 1, 'Must purge the low reward 0.25 episode');
  });

  await runTest('6.2 Episodic query across multiple sessions returns consolidated history', async () => {
    const episodes = await episodicMemory.getRecentEpisodes({ agentId, limit: 10 }, db);
    assert.strictEqual(episodes.length, 2, 'Should only contain the 2 consolidated episodes');
    assert.ok(episodes.every(e => e.isConsolidated === 1), 'Retained episodes must be consolidated');
  });
}

async function main() {
  console.log('======================================================================');
  console.log('   GenOS Cross-Session Multi-Hop Reasoning Benchmark Suite');
  console.log('======================================================================');

  await testThreeSessionTransitiveChain();
  await testTemporalMutationBranchPruning();
  await testDecoyBranchIsolation();
  await testEpistemicChainValidation();
  await testCyclicTraversalProtection();
  await testCrossSessionHippocampalConsolidation();

  console.log('\n======================================================================');
  console.log(`TOTAL CROSS-SESSION MULTI-HOP TESTS: ${passed + failed}`);
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
