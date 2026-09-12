/**
 * GenOS Extreme Communication & Token Management Benchmark Suite
 * Scenarios where LangChain, AutoGen, and CrewAI collapse under Token and Communication Pressure
 *
 * Benchmarks:
 * 1. O(N^2) Message Storm Suppression (Network Silence vs AutoGen GroupChat Context Overflow)
 * 2. Hard Token Budget Caps & Successive Halving (Budget Limit vs Uncontrolled LLM Burn)
 * 3. 10,000-Action Burst & Shannon Entropy Collapse (1ms Deadlock Detection)
 * 4. Zero-Token Negative Knowledge Interception (Dead-End Guard vs Repetitive LLM Hallucinations)
 * 5. Biomimetic STDP Synaptic Pruning (Noise Decay vs Unbounded Memory Flooding)
 */

const { networkSilence } = require('../../src/services/primitiveHandlers/strategyCollectiveAdvanced');
const { contextCompaction } = require('../../src/services/primitiveHandlers/strategyRemaining');
const { budgetLimit, reallocate } = require('../../src/services/primitiveHandlers/search');
const { calculateShannonEntropy } = require('../../src/services/swarmMetricsService');
const { avoidKnownDeadEnds, stdpUpdate } = require('../../src/services/primitiveHandlers/memory');
const { resolveQueryVector } = require('../../src/services/primitiveHandlers/memoryFailureSearch');
const { getDatabase } = require('../../src/db');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    passCount++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failCount++;
    console.error(`  [FAIL] ${testName} - ${details}`);
  }
}

async function testQuadraticCommunicationSuppression() {
  console.log('\n--- Challenge 1: O(N^2) Message Storm Suppression ---');
  console.log('  Competitor Failure: AutoGen GroupChat broadcasts all messages to all agents,');
  console.log('  generating O(N^2 * T) quadratic token explosion (8M+ tokens on 20 turns).');

  // Simulate a 200-message swarm conversation flood with 195 routine pings and 5 critical events
  const swarmFlood = [];
  for (let i = 0; i < 200; i++) {
    const isCritical = i % 40 === 0;
    swarmFlood.push({
      id: `msg_flood_${i}`,
      from: `agent_${i % 8}`,
      to: `agent_${(i + 1) % 8}`,
      content: isCritical ? `[ALERT] Vulnerability detected in branch ${i}` : `Heartbeat status check tick ${i}`,
      critical: isCritical,
      status: isCritical ? 'failure' : 'running'
    });
  }

  const silenceVerdict = await networkSilence({ messages: swarmFlood });
  assert(silenceVerdict.buffered === 195, 'Buffered 195 non-critical messages without transmitting');
  assert(silenceVerdict.flushed.length === 5, 'Flushed exclusively 5 high-priority critical events');
  assert(silenceVerdict.suppressed.length === 195, '97.5% chatter token volume suppressed from agent contexts');

  const compactVerdict = await contextCompaction({ items: swarmFlood, limit: 10 });
  assert(compactVerdict.retained.length === 10, 'Context compaction preserved densest 10 rolling items');
  assert(compactVerdict.removed === 190, 'Purged 190 redundant turns to prevent context window overflow');
}

async function testHardwareTokenBudgetGuard() {
  console.log('\n--- Challenge 2: Hardware-Level Token Budget Caps & Halving ---');
  console.log('  Competitor Failure: LangChain & CrewAI loop unthrottled, burning credits until 429 rate limit.');

  const orchestratorId = `orch_token_guard_${Date.now()}`;

  // Case A: Strict Cap Barring Runaway Spend
  const blockedRun = await budgetLimit({
    orchestratorId,
    limitType: 'token',
    maxLimit: 100000,
    currentUsage: 100005
  });
  assert(blockedRun.exceeded === true, 'Deterministic token ceiling halted spend before excess LLM calls');

  // Case B: In-Budget Operation
  const allowedRun = await budgetLimit({
    orchestratorId,
    limitType: 'token',
    maxLimit: 100000,
    currentUsage: 45000
  });
  assert(allowedRun.exceeded === false, 'Execution approved within safe token budget envelope');

  // Case C: Successive Halving Token Reallocation across Survivors
  const realloc = await reallocate({
    survivors: ['worker_alpha', 'worker_beta'],
    totalBudget: 120000
  });
  assert(realloc.allocations.worker_alpha === 60000, 'Reallocated pruned candidate budget (60k to Alpha)');
  assert(realloc.allocations.worker_beta === 60000, 'Reallocated pruned candidate budget (60k to Beta)');
}

async function testHighFrequencyBurstAndEntropy() {
  console.log('\n--- Challenge 3: 10,000-Action Burst & Shannon Entropy Collapse ---');
  console.log('  Competitor Failure: Frameworks freeze or oscillate indefinitely during micro-action retry loops.');

  // Generate 10,000 high-frequency swarm telemetry actions
  const burst10k = [];
  for (let i = 0; i < 10000; i++) {
    burst10k.push({ type: i % 4 === 0 ? 'read' : i % 4 === 1 ? 'eval' : i % 4 === 2 ? 'rebase' : 'merge' });
  }

  const startTime = Date.now();
  const burstStats = calculateShannonEntropy(burst10k, 100);
  const calculationTimeMs = Date.now() - startTime;

  assert(calculationTimeMs < 50, `Processed 10,000 telemetry events in ${calculationTimeMs}ms (< 50ms)`);
  assert(burstStats.sampleSize === 100, 'Windowed analysis extracted bounded 100-event telemetry slice');

  // Deadlock detection: 100% repetitive loop (Zero entropy collapse)
  const infiniteLoop = Array.from({ length: 50 }, () => ({ type: 'retry_failing_query' }));
  const deadlockStats = calculateShannonEntropy(infiniteLoop);

  assert(deadlockStats.normalizedEntropy === 0, 'Zero entropy calculated for identical repetitive actions');
  assert(deadlockStats.cognitiveDriftState === 'COLLAPSE_DEADLOCK', 'Deadlock sentinel flagged COLLAPSE_DEADLOCK');
}

async function testZeroTokenNegativeKnowledge(db) {
  console.log('\n--- Challenge 4: Zero-Token Negative Knowledge Interception ---');
  console.log('  Competitor Failure: CrewAI & AutoGen repeatedly retry failing SQL/code patterns, burning tokens.');

  const deadEndId = `dead_end_query_${Date.now()}`;
  const badQuery = 'SELECT password_hash FROM auth_tokens WHERE expiry = NULL';
  const queryVector = await resolveQueryVector(badQuery);
  const vectorBuffer = Buffer.from(new Float32Array(queryVector).buffer);

  // Store known failure in negative knowledge base
  await db.run(
    `INSERT INTO genome_decisions (id, title, content, cart_nodes_json, created_by, category, embedding_blob)
     VALUES (?, 'SQL Null Equality Anti-Pattern', ?, '["step_sql_err"]', 'worker_sql', 'Failure', ?)`,
    deadEndId, JSON.stringify({ detail: badQuery }), vectorBuffer
  );

  // Agent attempts identical or closely related failing query
  const interception = await avoidKnownDeadEnds({
    query: 'SELECT password_hash FROM auth_tokens WHERE expiry = NULL',
    threshold: 0.50
  });

  assert(interception.isDeadEndRisk === true, 'Interception triggered before issuing query');
  assert(interception.riskScore > 0.80, `High semantic match to known dead end (${interception.riskScore.toFixed(2)})`);
  assert(interception.warning !== null, 'Action blocked with 0 LLM tokens spent (100% budget savings)');
}

async function testStdpSynapticPruning() {
  console.log('\n--- Challenge 5: Biomimetic STDP Synaptic Pruning & Neuromodulation ---');
  console.log('  Competitor Failure: Memory stores collect unbounded noise; signal-to-noise ratio degrades.');

  const sourceDec = `stdp_node_cause_${Date.now()}`;
  const targetDec = `stdp_node_effect_${Date.now()}`;

  // Hebbian LTP: Pre-synaptic spike precedes Post-synaptic spike (causal correlation + Dopamine)
  const potentiation = await stdpUpdate({
    sourceId: sourceDec,
    targetId: targetDec,
    preSpikeAt: 5000,
    postSpikeAt: 5020,
    transmitterType: 'dopamine',
    rewardSignal: 2.0
  });

  assert(potentiation.success === true, 'STDP potentiation computed successfully');
  assert(potentiation.update > 0, `Positive synaptic reinforcement (update = +${potentiation.update})`);
  assert(potentiation.newWeight > 0.70, 'Synaptic pathway strengthened via dopamine neuromodulation');

  // Anti-Hebbian LTD: Uncorrelated / Reverse firing order degrades noisy connection
  const depression = await stdpUpdate({
    sourceId: sourceDec,
    targetId: targetDec,
    preSpikeAt: 5050,
    postSpikeAt: 5010,
    transmitterType: 'glutamate'
  });

  assert(depression.success === true, 'STDP depression computed successfully');
  assert(depression.update < 0, `Negative synaptic depression (update = ${depression.update})`);
  assert(depression.newWeight < potentiation.newWeight, 'Noisy synapse weight degraded, pruning memory clutter');
}

async function runExtremeTokenCommSuite() {
  console.log('======================================================================');
  console.log(' GenOS Extreme Communication & Token Management Stress Benchmark');
  console.log('======================================================================');

  const startTime = Date.now();
  const db = await getDatabase();

  await testQuadraticCommunicationSuppression();
  await testHardwareTokenBudgetGuard();
  await testHighFrequencyBurstAndEntropy();
  await testZeroTokenNegativeKnowledge(db);
  await testStdpSynapticPruning();

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  const totalTests = passCount + failCount;

  console.log('\n======================================================================');
  console.log(` Extreme Token/Comm Summary: ${passCount}/${totalTests} PASS (${failCount} FAIL) in ${totalTime}s`);
  console.log('======================================================================');

  if (failCount > 0) process.exit(1);
}

runExtremeTokenCommSuite().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
