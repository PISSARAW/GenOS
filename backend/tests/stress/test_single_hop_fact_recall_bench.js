/**
 * GenOS Single-Hop Fact Recall Benchmark Suite
 * High-precision memory retrieval challenges:
 * 1. Needle In A Haystack (NIAH) with 50 Semantic Decoys
 * 2. Temporal Invalidation & GABAergic Synaptic Retraction
 * 3. Epistemic Novelty Detection & Metacognitive Refusal
 * 4. Multi-Tenant & Cross-Project Strict Quarantine
 * 5. Epistemic Integrity Shield on Tainted / Placeholder Facts
 * 6. High-Throughput Sub-50ms Retrieval Latency
 */

const assert = require('assert');
const vectorMemory = require('../../src/services/vectorMemoryService');
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

async function testNeedleInHaystack() {
  console.log('\n--- Challenge 1: Needle In A Haystack (NIAH) with 50 Semantic Decoys ---');
  console.log('  Competitor Failure: Vector dilution / keyword collisions retrieve decoy clusters.');

  const db = await getDatabase();
  const agentId = `agent_niah_${Date.now()}`;
  const orgId = `org_niah_${Date.now()}`;

  // Ingest 50 decoy facts
  for (let i = 1; i <= 50; i++) {
    const decoyName = `cluster_${i.toString().padStart(2, '0')}`;
    const decoyPort = 8000 + i;
    await vectorMemory.storeMemory(
      agentId,
      `The configuration for ${decoyName} is running on port ${decoyPort} with standard HTTP auth.`,
      null,
      { title: `Config ${decoyName}`, organizationId: orgId }
    );
  }

  // Ingest the target needle
  const needleId = await vectorMemory.storeMemory(
    agentId,
    'The configuration for cluster_omega is running on port 9443 with mutual TLS authentication enabled.',
    null,
    { title: 'Config cluster_omega', organizationId: orgId }
  );

  await runTest('1.1 Retrieve exact target needle at Rank 1 despite 50 decoys', async () => {
    const res = await vectorMemory.searchMemory(
      'cluster_omega configuration port',
      { organizationId: orgId, limit: 5 },
      db
    );
    const topItem = res.allScoredExperiences?.[0];
    assert.ok(topItem, 'Must return at least one memory item');
    assert.strictEqual(topItem.id, needleId);
    assert.ok(topItem.summary.includes('9443'));
    assert.ok(topItem.summary.includes('mutual TLS'));
  });

  await runTest('1.2 Target needle cosine metric dominates decoy scores', async () => {
    const res = await vectorMemory.searchMemory(
      'cluster_omega configuration port',
      { organizationId: orgId, limit: 5 },
      db
    );
    assert.ok(res.allScoredExperiences.length >= 2);
    const topCos = res.allScoredExperiences[0].cosineMetric || 0;
    const secondCos = res.allScoredExperiences[1].cosineMetric || 0;
    assert.ok(topCos > secondCos, 'Rank 1 must have strictly higher cosine metric than decoys');
  });
}

async function testGabaergicRetraction() {
  console.log('\n--- Challenge 2: Temporal Invalidation & GABAergic Synaptic Retraction ---');
  console.log('  Competitor Failure: Naive vector RAG retrieves obsolete superseded facts.');

  const db = await getDatabase();
  const agentId = `agent_gaba_${Date.now()}`;

  const oldFactId = await vectorMemory.storeMemory(
    agentId,
    'The primary database replica host is db-replica-01.internal:5432',
    null,
    { title: 'DB Replica Host (Old)' }
  );

  const newFactId = await vectorMemory.storeMemory(
    agentId,
    'The primary database replica host has been decommissioned and migrated to db-replica-02.internal:5433',
    null,
    { title: 'DB Replica Host (New)' }
  );

  // Invalidate old fact via negative GABAergic synapse
  await db.run(
    'INSERT INTO memory_synapses (source_id, target_id, weight, transmitter_type) VALUES (?, ?, ?, ?)',
    [newFactId, oldFactId, -2.5, 'gaba']
  );

  await runTest('2.1 GABAergic synaptic inhibition suppresses obsolete fact', async () => {
    const res = await vectorMemory.searchMemory('What is the primary database replica host?', { limit: 5 }, db);
    const foundOld = res.allScoredExperiences.some(x => x.id === oldFactId);
    const foundNew = res.allScoredExperiences.some(x => x.id === newFactId);

    assert.strictEqual(foundOld, false, 'Obsolete fact must be completely suppressed by GABA synapse');
    assert.strictEqual(foundNew, true, 'Updated fact must be recalled');
  });

  await runTest('2.2 Auditing mode allows retrieving inhibited facts with active signal', async () => {
    const res = await vectorMemory.searchMemory(
      'What is the primary database replica host?',
      { limit: 5, includeInhibited: true },
      db
    );
    const oldItem = res.allScoredExperiences.find(x => x.id === oldFactId);
    assert.ok(oldItem, 'Old fact should be accessible when includeInhibited is set');
    assert.strictEqual(oldItem.inhibitorySignal, 'active');
  });

  await runTest('2.3 Restoring synapse weight reverses inhibition and reactivates fact', async () => {
    await db.run(
      'UPDATE memory_synapses SET weight = 1.0, transmitter_type = ? WHERE source_id = ? AND target_id = ?',
      ['glutamate', newFactId, oldFactId]
    );
    const res = await vectorMemory.searchMemory('What is the primary database replica host?', { limit: 5 }, db);
    const foundOld = res.allScoredExperiences.some(x => x.id === oldFactId);
    assert.strictEqual(foundOld, true, 'Reactivated fact must now be recalled');
  });
}

async function testMetacognitiveNovelty() {
  console.log('\n--- Challenge 3: Epistemic Novelty Detection & Metacognitive Refusal ---');
  console.log('  Competitor Failure: Hallucinates plausible answers when queried for absent entities.');

  await runTest('3.1 Metacognition flags query for unknown entity as novel', async () => {
    const res = await vectorMemory.searchMemory('What is the root secret key of server-hyperion-quantum-xyz?');
    assert.ok(res.metacognition, 'Must compute metacognition metrics');
    assert.strictEqual(res.metacognition.noveltyDetected, true);
  });

  await runTest('3.2 GABAergic inhibition activates on low semantic confidence', async () => {
    const res = await vectorMemory.searchMemory('UnanchoredQuantumEntropyToken999');
    assert.strictEqual(res.metacognition.gabaInhibited, true);
  });
}

async function testTenantQuarantine() {
  console.log('\n--- Challenge 4: Multi-Tenant & Cross-Project Strict Quarantine ---');
  console.log('  Competitor Failure: Unscoped vector search leaks secrets across tenants.');

  const db = await getDatabase();
  const agentId = `agent_tenant_${Date.now()}`;
  const secureOrg = `org_classified_${Date.now()}`;
  const guestOrg = `org_guest_${Date.now()}`;

  const secretFactId = await vectorMemory.storeMemory(
    agentId,
    'Confidential project revenue forecast for Q4 is 42.5M USD.',
    null,
    { title: 'Q4 Revenue Forecast', organizationId: secureOrg }
  );

  await runTest('4.1 Fact is recalled by authorized tenant', async () => {
    const res = await vectorMemory.searchMemory('Q4 revenue forecast', { organizationId: secureOrg }, db);
    const found = res.allScoredExperiences.some(x => x.id === secretFactId);
    assert.strictEqual(found, true);
  });

  await runTest('4.2 Fact is strictly quarantined from unauthorized guest tenant', async () => {
    const res = await vectorMemory.searchMemory('Q4 revenue forecast', { organizationId: guestOrg }, db);
    const found = res.allScoredExperiences.some(x => x.id === secretFactId);
    assert.strictEqual(found, false);
  });

  await runTest('4.3 Multi-project scoping isolates facts within same organization', async () => {
    const projA = `proj_alpha_${Date.now()}`;
    const projB = `proj_beta_${Date.now()}`;
    const factProjA = await vectorMemory.storeMemory(agentId, 'Project Alpha build artifact is art-992.bin', null, {
      organizationId: secureOrg,
      projectId: projA
    });
    const res = await vectorMemory.searchMemory('build artifact', { organizationId: secureOrg, projectId: projB }, db);
    const leaked = res.allScoredExperiences.some(x => x.id === factProjA);
    assert.strictEqual(leaked, false, 'Facts must not leak across project boundaries');
  });
}

async function testEpistemicIntegrityShield() {
  console.log('\n--- Challenge 5: Epistemic Integrity Shield on Tainted / Placeholder Facts ---');
  console.log('  Competitor Failure: Passes unverified claims directly into agent generation prompts.');

  const taintedMemory = {
    id: 'mem_tainted_fact_01',
    content: '[unverified_claim] The production cipher suite is DES-56-CBC',
    tags: ['unproven', 'security'],
    credibility: 0.1
  };

  const legitimateMemory = {
    id: 'mem_verified_fact_01',
    content: 'The production cipher suite is TLS_AES_256_GCM_SHA384',
    tags: ['verified', 'golden_path'],
    credibility: 0.99
  };

  await runTest('5.1 Epistemic perception marks tainted fact as INVALID', () => {
    const epistemic = epistemics.validateMemoryPerception(taintedMemory);
    assert.strictEqual(epistemic.state, 'INVALID');
    assert.strictEqual(epistemic.isInvalid(), true);
    assert.strictEqual(epistemic.isOperationAllowed('generate'), false);
    assert.strictEqual(epistemic.isOperationAllowed('act'), false);
  });

  await runTest('5.2 Epistemic perception marks certified fact as VALID', () => {
    const epistemic = epistemics.validateMemoryPerception(legitimateMemory);
    assert.strictEqual(epistemic.state, 'VALID');
    assert.strictEqual(epistemic.isInvalid(), false);
    assert.strictEqual(epistemic.isOperationAllowed('generate'), true);
  });

  await runTest('5.3 Recalled fact with obsolete tag blocks planning and acting', () => {
    const obsoleteMemory = {
      id: 'mem_old_cipher',
      content: '[obsolete/corrected fact - do not use] Old port was 8080',
      tags: ['obsolete_suppressed']
    };
    const epistemic = epistemics.validateMemoryPerception(obsoleteMemory);
    assert.strictEqual(epistemic.state, 'INVALID');
    assert.strictEqual(epistemic.isOperationAllowed('plan'), false);
    assert.strictEqual(epistemic.isOperationAllowed('act'), false);
  });
}

async function testRecallLatencyBenchmark() {
  console.log('\n--- Challenge 6: High-Throughput Sub-50ms Retrieval Latency ---');
  console.log('  Competitor Failure: Sequential Python vector lookup scales poorly under high load.');

  const db = await getDatabase();
  const startTime = Date.now();
  const iterations = 10;

  for (let i = 0; i < iterations; i++) {
    await vectorMemory.searchMemory(`cluster_${(i * 3 + 1).toString().padStart(2, '0')}`, { limit: 3 }, db);
  }

  const durationMs = Date.now() - startTime;
  const avgLatencyMs = Number((durationMs / iterations).toFixed(2));

  await runTest(`6.1 Average recall latency (${avgLatencyMs}ms) meets sub-50ms SLA`, () => {
    assert.ok(avgLatencyMs < 50, `Expected < 50ms average latency, got ${avgLatencyMs}ms`);
  });

  await runTest('6.2 Memory footprint remains bounded across burst queries', () => {
    const memUsage = process.memoryUsage();
    assert.ok(memUsage.heapUsed > 0);
    assert.ok(memUsage.heapUsed < 500 * 1024 * 1024, 'Heap usage should remain bounded under 500MB');
  });
}

async function main() {
  console.log('======================================================================');
  console.log('   GenOS Single-Hop Fact Recall Benchmark Suite');
  console.log('======================================================================');

  await testNeedleInHaystack();
  await testGabaergicRetraction();
  await testMetacognitiveNovelty();
  await testTenantQuarantine();
  await testEpistemicIntegrityShield();
  await testRecallLatencyBenchmark();

  console.log('\n======================================================================');
  console.log(`TOTAL SINGLE-HOP FACT RECALL TESTS: ${passed + failed}`);
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
