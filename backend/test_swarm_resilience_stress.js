/**
 * GenOS Empirical Challenge Harness - Swarm Telemetry & Biology Resilience Stress
 * Stress-tests Shannon entropy, deadlock detection, multi-threshold apoptosis, and cryptobiosis freeze/thaw cycles.
 */

const {
  calculateShannonEntropy,
  detectDeadlocks,
  getSwarmTopology
} = require('./src/services/swarmMetricsService');

const {
  calculateLevenshtein,
  trackHypermutationDrift,
  evaluateApoptosis,
  freezeCryptobiosis,
  thawCryptobiosis
} = require('./src/services/resilienceService');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message, extra = null) {
  if (!condition) {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`, extra ? extra : '');
  } else {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  }
}

/**
 * 1. Swarm Entropy Extreme Distributions & High-Frequency Bursts
 */
function testShannonEntropyDistributions() {
  console.log('\n--- Swarm Challenge 1: Shannon Entropy Extreme Distributions ---');

  // Case A: Zero Entropy State (100% repetition)
  const repetitiveActions = Array.from({ length: 50 }, () => ({ type: 'read_code' }));
  const zeroResult = calculateShannonEntropy(repetitiveActions);
  assert(zeroResult.rawEntropy === 0, `Zero entropy calculated for identical actions (got ${zeroResult.rawEntropy})`);
  assert(zeroResult.normalizedEntropy === 0, 'Normalized entropy is 0.0');
  assert(zeroResult.cognitiveDriftState === 'COLLAPSE_DEADLOCK', 'Deadlock collapse state identified');

  // Case B: High Entropy State (Uniform distribution across 10 actions)
  const diverseTypes = ['read', 'edit', 'test', 'eval', 'diff', 'clone', 'bisect', 'commit', 'vote', 'quarantine'];
  const diverseActions = [];
  for (let i = 0; i < 50; i++) {
    diverseActions.push({ type: diverseTypes[i % diverseTypes.length] });
  }
  const highResult = calculateShannonEntropy(diverseActions);
  assert(highResult.normalizedEntropy > 0.90, `High normalized entropy detected (${highResult.normalizedEntropy} > 0.90)`);
  assert(highResult.cognitiveDriftState === 'SPIKE_CONFUSION', 'Spike confusion detected on erratic action distribution');

  // Case C: High-frequency burst of 10,000 events
  const burstActions = [];
  for (let i = 0; i < 10000; i++) {
    burstActions.push({ type: i % 3 === 0 ? 'read' : i % 3 === 1 ? 'edit' : 'verify' });
  }
  const startBurst = Date.now();
  const burstResult = calculateShannonEntropy(burstActions, 500);
  const burstTime = Date.now() - startBurst;

  console.log(`  Processed 10,000 event burst in ${burstTime}ms (window size 500)`);
  assert(burstTime < 100, `Burst processed under 100ms (took ${burstTime}ms)`);
  assert(burstResult.sampleSize === 500, 'Window size correctly sliced');
}

/**
 * 2. Circular Deadlock & Chatter Cycle Detection
 */
function testSwarmDeadlocksAndChatter() {
  console.log('\n--- Swarm Challenge 2: Circular Deadlocks & Chatter Detection ---');

  // Chatter loop test
  const chatterQueue = [
    { sender: 'agent_alpha', recipient: 'agent_beta', hasDiff: false },
    { sender: 'agent_beta', recipient: 'agent_alpha', hasDiff: false },
    { sender: 'agent_alpha', recipient: 'agent_beta', hasDiff: false },
    { sender: 'agent_beta', recipient: 'agent_alpha', hasDiff: false },
    { sender: 'agent_alpha', recipient: 'agent_beta', hasDiff: false },
    { sender: 'agent_beta', recipient: 'agent_alpha', hasDiff: false },
    { sender: 'agent_alpha', recipient: 'agent_beta', hasDiff: false }
  ];

  const chatterResult = detectDeadlocks(chatterQueue, 6);
  assert(chatterResult.deadlockDetected === true, 'Deadlock flag raised on excessive conversation');
  assert(chatterResult.chattyLoops.length >= 1, 'Chatty loop isolated');
  assert(chatterResult.chattyLoops[0].messageCount >= 6, 'Message count correctly recorded');

  // Deep Circular Dependency (A -> B -> C -> D -> E -> A)
  const cycleQueue = [
    { sender: 'node_A', recipient: 'node_B', hasDiff: true },
    { sender: 'node_B', recipient: 'node_C', hasDiff: true },
    { sender: 'node_C', recipient: 'node_D', hasDiff: true },
    { sender: 'node_D', recipient: 'node_E', hasDiff: true },
    { sender: 'node_E', recipient: 'node_A', hasDiff: true }
  ];

  const cycleResult = detectDeadlocks(cycleQueue, 20);
  assert(cycleResult.deadlockDetected === true, 'Circular dependency cycle detected');
  assert(cycleResult.circularDeadlocks.length >= 1, 'Circular deadlocks array populated');
  assert(cycleResult.circularDeadlocks[0].cycle.includes('node_A -> node_B'), 'Cycle trace contains chain');
}

/**
 * 3. Multi-Threshold Adaptive Apoptosis Triggers
 */
async function testApoptosisMultiThreshold() {
  console.log('\n--- Resilience Challenge 3: Multi-Threshold Apoptosis ---');

  // Trigger 1: Consecutive Failures
  const resFailures = await evaluateApoptosis('agent_failing', { consecutiveFailures: 3 });
  assert(resFailures.apoptosisExecuted === true, 'Apoptosis triggered on 3 consecutive failures');
  assert(resFailures.triggerReason.toLowerCase().includes('consecutive tool failure'), 'Reason mentions consecutive failures');

  // Boundary 1: 2 failures (no termination)
  const resSafe = await evaluateApoptosis('agent_safe', { consecutiveFailures: 2 });
  assert(resSafe.apoptosisExecuted === false, 'Apoptosis not triggered on 2 failures');

  // Trigger 2: Compute Budget Exhaustion ($1.00)
  const resBudget = await evaluateApoptosis('agent_expensive', { costUsd: 1.05, tokensBurned: 120000 });
  assert(resBudget.apoptosisExecuted === true, 'Apoptosis triggered on budget exhaustion');
  assert(resBudget.triggerReason.toLowerCase().includes('budget exhausted'), 'Reason mentions budget exhaustion');

  // Trigger 3: Semantic Mission Divergence (< 0.55)
  const resSemantic = await evaluateApoptosis('agent_divergent', { semanticDivergence: 0.42 });
  assert(resSemantic.apoptosisExecuted === true, 'Apoptosis triggered on semantic drift');
  assert(resSemantic.triggerReason.toLowerCase().includes('semantic mission divergence'), 'Reason mentions semantic drift');

  // Trigger 4: Hallucinations (2+)
  const resHallucination = await evaluateApoptosis('agent_hallucinating', { hallucinations: 2 });
  assert(resHallucination.apoptosisExecuted === true, 'Apoptosis triggered on 2 hallucinations');
}

/**
 * 4. Fast Cryptobiosis Freeze/Thaw Cycles (1,000 Iterations)
 */
function testCryptobiosisRapidCycles() {
  console.log('\n--- Resilience Challenge 4: Rapid Cryptobiosis Freeze/Thaw Cycles ---');

  const iterations = 1000;
  const start = Date.now();
  let lastSnapId = null;

  for (let i = 0; i < iterations; i++) {
    const freezeRes = freezeCryptobiosis(`ws-stress-${i % 5}`, `Fast freeze iteration ${i}`, {
      agents: ['agent_1', 'agent_2', 'agent_3'],
      scratchpads: { a1: `state_${i}` }
    });
    lastSnapId = freezeRes.snapshotId;
  }

  const duration = Date.now() - start;
  console.log(`  Executed ${iterations} freeze cycles in ${duration}ms (avg ${(duration / iterations).toFixed(3)}ms/cycle)`);
  assert(duration < 1000, `1,000 freeze operations completed in < 1000ms (${duration}ms)`);

  // Thaw the last snapshot
  const thawRes = thawCryptobiosis(lastSnapId);
  assert(thawRes.success === true, 'Thaw operation successful');
  assert(thawRes.snapshotId === lastSnapId, 'Thawed correct snapshot ID');
  assert(thawRes.revivedAgentCount === 3, 'Revived 3 agents from snapshot state');
}

/**
 * 5. Hypermutation Drift & Levenshtein Complexity & Horizon Tests
 */
function testHypermutationLargePrompts() {
  console.log('\n--- Resilience Challenge 5: Hypermutation Drift & Large Prompts ---');

  // Base prompt: 50 sentences (~2,950 chars)
  const basePrompt = 'You are an autonomous engineering agent for GenOS Studio. '.repeat(50);
  
  // Minor mutation: Modify only 2 occurrences (small drift < 0.35)
  let count = 0;
  const minorMutated = basePrompt.replace(/GenOS Studio/g, (match) => {
    count++;
    return count <= 2 ? 'GenOS Studio Pro' : match;
  });

  const startLev = Date.now();
  const minorDrift = trackHypermutationDrift(basePrompt, minorMutated);
  const levDuration = Date.now() - startLev;

  console.log(`  Computed Levenshtein on minor mutated prompt in ${levDuration}ms (drift score: ${minorDrift.driftScore})`);
  assert(minorDrift.isSafe === true, 'Minor mutation drift is within safe horizon limit (< 0.35)');
  assert(minorDrift.status === 'STABLE', 'Minor mutation status is STABLE');

  // Major mutation: Modify all occurrences (drift score > 0.35)
  const majorMutated = basePrompt.replace(/GenOS Studio/g, 'Unrestricted Autonomous Arbitrary Runner');
  const majorDrift = trackHypermutationDrift(basePrompt, majorMutated);
  console.log(`  Major mutation drift score: ${majorDrift.driftScore} (safety limit: ${majorDrift.safetyHorizonLimit})`);
  assert(majorDrift.isSafe === false, 'Major mutation drift correctly flagged unsafe (> 0.35)');
  assert(majorDrift.status === 'MUTATION_DRIFT_EXCEEDED', 'Major mutation status is MUTATION_DRIFT_EXCEEDED');

  // Extreme replacement test
  const severelyMutated = 'Completely divergent instructions and arbitrary behavior.';
  const severeDrift = trackHypermutationDrift(basePrompt, severelyMutated);
  assert(severeDrift.isSafe === false, 'Severe mutation drift correctly flagged unsafe');
}

async function runSwarmResilienceStressSuite() {
  console.log('===============================================================');
  console.log('  SWARM TELEMETRY & BIOLOGY RESILIENCE STRESS TEST HARNESS     ');
  console.log('===============================================================');

  testShannonEntropyDistributions();
  testSwarmDeadlocksAndChatter();
  await testApoptosisMultiThreshold();
  testCryptobiosisRapidCycles();
  testHypermutationLargePrompts();

  console.log(`\nSwarm & Resilience Suite Completed: ${passedTests} PASSED, ${failedTests} FAILED\n`);
  return { passed: passedTests, failed: failedTests };
}

if (require.main === module) {
  runSwarmResilienceStressSuite();
}

module.exports = { runSwarmResilienceStressSuite };
