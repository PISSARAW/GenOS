/**
 * GenOS Multi-Agent Coordination, Consensus & Game Theory Benchmark Suite
 * High-complexity decentralized swarm, game-theoretic calibration, quorum,
 * and deadlock resilience challenges:
 * 1. Game-Theoretic Continuous Brier Calibration & Weight Attenuation
 * 2. Strict Quorum Neutrality & Zero Lexical Tie-Break Vulnerability
 * 3. Swarm Circular Deadlock & Chatty Loop Detection (A -> B -> C -> A)
 * 4. Shannon Cognitive Entropy & Echo-Chamber / Groupthink Collapse Sentinel
 * 5. Minimum Participation Floor & Anti-Minority Hijack Protection
 * 6. Swarm Proposal Lifecycle & Canonical Rejection Calculus
 */

const assert = require('assert');
const quorum = require('../../src/services/primitiveHandlers/quorumPolicy');
const { calculateShannonEntropy, detectDeadlocks } = require('../../src/services/swarmMetricsService');

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

async function testBrierCalibrationAndGameTheory() {
  console.log('\n--- Challenge 1: Game-Theoretic Continuous Brier Calibration ---');
  console.log('  Competitor Failure: 1-agent = 1-vote allows hallucinating majorities to overpower calibrated experts.');

  await runTest('1.1 Continuous quadratic Brier weighting penalizes uncalibrated agents', () => {
    const expertWeight = quorum.brierScoreToWeight(0.0);
    const calibratedWeight = quorum.brierScoreToWeight(0.1);
    const uncertainWeight = quorum.brierScoreToWeight(0.5);
    const hallucinatingWeight = quorum.brierScoreToWeight(0.9);
    const catastrophicWeight = quorum.brierScoreToWeight(1.0);

    assert.strictEqual(expertWeight, 1.0, 'Perfect calibration yields weight 1.0');
    assert.ok(Math.abs(calibratedWeight - 0.81) < 1e-6, 'Brier 0.1 yields weight 0.81');
    assert.ok(Math.abs(uncertainWeight - 0.25) < 1e-6, 'Brier 0.5 yields weight 0.25');
    assert.ok(Math.abs(hallucinatingWeight - 0.01) < 1e-6, 'Brier 0.9 yields weight 0.01');
    assert.strictEqual(catastrophicWeight, 0.0, 'Brier 1.0 yields zero weight');
  });

  await runTest('1.2 Weighted swarm voting elevates calibrated minority over uncalibrated majority', () => {
    // 1 calibrated expert agent (brier 0.05 -> weight 0.9025) votes YES
    // 3 poorly calibrated agents (brier 0.85 -> weight 0.0225 each, sum = 0.0675) vote NO
    const votes = [
      { agentId: 'expert-1', vote: 'yes', weight: quorum.brierScoreToWeight(0.05) },
      { agentId: 'noisy-1', vote: 'no', weight: quorum.brierScoreToWeight(0.85) },
      { agentId: 'noisy-2', vote: 'no', weight: quorum.brierScoreToWeight(0.85) },
      { agentId: 'noisy-3', vote: 'no', weight: quorum.brierScoreToWeight(0.85) }
    ];

    const unweightedTally = quorum.tallySwarmVotes({ votes, weighted: false });
    assert.strictEqual(unweightedTally.yesCount, 1);
    assert.strictEqual(unweightedTally.noCount, 3);
    assert.ok(unweightedTally.noCount > unweightedTally.yesCount, 'Unweighted majority votes NO');

    const weightedTally = quorum.tallySwarmVotes({ votes, weighted: true });
    assert.ok(weightedTally.yesWeight > 0.90);
    assert.ok(weightedTally.noWeight < 0.10);
    assert.ok(weightedTally.yesWeight > weightedTally.noWeight, 'Weighted game-theoretic tally crowns YES');
  });

  await runTest('1.3 Calculate exact scalar and categorical Brier score for agent forecast', () => {
    // Scalar binary: forecast 0.8 for event that occurred (1)
    const scalarItem = { prediction: 0.8, outcome: 1 };
    const scalarBrier = quorum.calculateItemBrierScore(scalarItem);
    // (0.8 - 1)^2 = 0.04
    assert.ok(Math.abs(scalarBrier - 0.04) < 1e-6);

    // Multi-class categorical forecast
    const categoricalItem = {
      prediction: { release_patch: 0.7, delay_release: 0.2, abort: 0.1 },
      outcome: 'release_patch'
    };
    const catBrier = quorum.calculateItemBrierScore(categoricalItem);
    assert.ok(Number.isFinite(catBrier) && catBrier >= 0 && catBrier <= 1);
  });
}

async function testQuorumStrictNeutrality() {
  console.log('\n--- Challenge 2: Strict Quorum Neutrality & Tie Epsilon ---');
  console.log('  Competitor Failure: Lexical tie-break allows AAA_EXPLOIT to win 50/50 ties.');

  await runTest('2.1 Exact 50/50 tie within EPSILON results in null decision and tied status', () => {
    const pack = {
      tally: { 'AAA_MALICIOUS': 50, 'ZZZ_SECURE': 50 },
      threshold: 0.5,
      participationCount: 100,
      minVotes: 50
    };

    const evaluation = quorum.evaluateQuorum(pack);
    assert.strictEqual(evaluation.quorumReached, false);
    assert.strictEqual(evaluation.decision, null);
    assert.strictEqual(evaluation.status, 'tied');
  });

  await runTest('2.2 Micro-difference exceeding EPSILON (1e-9) awards winner deterministically', () => {
    const pack = {
      tally: { 'option_alpha': 50.00000001, 'option_beta': 50.0 },
      threshold: 0.5,
      participationCount: 100,
      minVotes: 50
    };

    const evaluation = quorum.evaluateQuorum(pack);
    assert.strictEqual(evaluation.quorumReached, true);
    assert.strictEqual(evaluation.decision, 'option_alpha');
    assert.strictEqual(evaluation.status, 'won');
  });

  await runTest('2.3 Abstentions are excluded from approval totals but count toward participation', () => {
    const votes = [
      { agentId: 'a1', vote: 'yes' },
      { agentId: 'a2', vote: 'yes' },
      { agentId: 'a3', vote: 'no' },
      { agentId: 'a4', vote: 'abstain' }
    ];

    const tally = quorum.tallySwarmVotes({ votes });
    assert.strictEqual(tally.yesCount, 2);
    assert.strictEqual(tally.noCount, 1);
    assert.strictEqual(tally.abstainCount, 1);
    assert.strictEqual(tally.participationCount, 4);
  });
}

async function testSwarmDeadlockDetection() {
  console.log('\n--- Challenge 3: Swarm Circular Deadlock & Chatty Loop Detection ---');
  console.log('  Competitor Failure: Circular delegation traps multi-agent swarms in infinite lock.');

  await runTest('3.1 Detect 3-agent circular deadlock loop (A -> B -> C -> A)', () => {
    const messageQueue = [
      { sender: 'agent_alpha', recipient: 'agent_beta', hasDiff: false },
      { sender: 'agent_beta', recipient: 'agent_gamma', hasDiff: false },
      { sender: 'agent_gamma', recipient: 'agent_alpha', hasDiff: false }
    ];

    const result = detectDeadlocks(messageQueue);
    assert.strictEqual(result.deadlockDetected, true);
    assert.strictEqual(result.circularDeadlocks.length, 1);
    assert.ok(result.circularDeadlocks[0].cycle.includes('agent_alpha'));
    assert.ok(result.circularDeadlocks[0].cycle.includes('agent_beta'));
    assert.ok(result.circularDeadlocks[0].cycle.includes('agent_gamma'));
  });

  await runTest('3.2 Detect chatty unproductive loop exceeding threshold without code progress', () => {
    const chattyQueue = [];
    for (let i = 0; i < 9; i += 1) {
      chattyQueue.push({ sender: 'reviewer_1', recipient: 'coder_1', hasDiff: false });
    }

    const result = detectDeadlocks(chattyQueue, 8);
    assert.strictEqual(result.deadlockDetected, true);
    assert.strictEqual(result.chattyLoops.length, 1);
    assert.strictEqual(result.chattyLoops[0].messageCount, 9);
  });

  await runTest('3.3 Linear forward communication DAG does not trigger deadlock false positive', () => {
    const linearQueue = [
      { sender: 'orchestrator', recipient: 'worker_1', hasDiff: false },
      { sender: 'worker_1', recipient: 'validator', hasDiff: true },
      { sender: 'validator', recipient: 'sink', hasDiff: false }
    ];

    const result = detectDeadlocks(linearQueue);
    assert.strictEqual(result.deadlockDetected, false);
    assert.strictEqual(result.circularDeadlocks.length, 0);
  });
}

async function testShannonEntropyCollapseSentinel() {
  console.log('\n--- Challenge 4: Shannon Cognitive Entropy & Echo-Chamber Sentinel ---');
  console.log('  Competitor Failure: Swarms succumb to groupthink and cognitive collapse silently.');

  await runTest('4.1 High cognitive diversity produces normalized Shannon entropy near 1.0', () => {
    const diverseActions = [
      'analyze_ast', 'run_tests', 'refactor_module', 'validate_memory',
      'query_graph_rag', 'simulate_dry_run', 'check_quorum', 'deposit_pheromone'
    ];

    const stats = calculateShannonEntropy(diverseActions);
    assert.ok(stats.entropy > 2.5, 'Diverse actions must have high absolute Shannon entropy');
    assert.ok(stats.normalizedEntropy > 0.90, 'Normalized entropy must approach 1.0');
    assert.ok(stats.dominanceRatio < 0.25, 'No single action dominates');
  });

  await runTest('4.2 Echo-chamber / repetitive loop collapses entropy towards 0.0', () => {
    const collapsedActions = Array(30).fill('ping_status');

    const stats = calculateShannonEntropy(collapsedActions);
    assert.strictEqual(stats.entropy, 0, 'Zero uncertainty when 100% repetitive');
    assert.strictEqual(stats.normalizedEntropy, 0);
    assert.strictEqual(stats.dominanceRatio, 1.0, 'Single action dominance is 100%');
  });

  await runTest('4.3 Markov transition entropy detects periodic oscillating cycles', () => {
    // Oscillating ABABAB pattern
    const oscillating = [];
    for (let i = 0; i < 20; i += 1) {
      oscillating.push(i % 2 === 0 ? 'query' : 'answer');
    }

    const stats = calculateShannonEntropy(oscillating);
    assert.strictEqual(stats.isPeriodicCycle, true, 'Must flag periodic cycle');
    assert.strictEqual(stats.cycleLength, 2, 'Period cycle length must be 2');
  });
}

async function testParticipationFloorProtection() {
  console.log('\n--- Challenge 5: Participation Floor & Anti-Minority Protection ---');
  console.log('  Competitor Failure: 1 rogue agent votes alone and passes proposals with 100% approval.');

  await runTest('5.1 Reject proposal with 100% approval when participation floor is unmet', () => {
    const pack = {
      tally: { 'YES': 1 },
      threshold: 0.5,
      participationCount: 1, // Only 1 out of 10 voted
      activeCount: 10
    };

    // Minimum required voters for 10 active agents is max(2, ceil(10 * 0.5)) = 5
    const floor = quorum.resolveMinParticipation({ activeCount: 10 });
    assert.strictEqual(floor, 5);

    const evaluation = quorum.evaluateQuorum(pack);
    assert.strictEqual(evaluation.quorumReached, false);
    assert.strictEqual(evaluation.status, 'no_quorum');
    assert.strictEqual(evaluation.decision, null);
  });

  await runTest('5.2 Accept proposal when participation reaches quorum floor and threshold', () => {
    const pack = {
      tally: { 'YES': 4, 'NO': 1 },
      threshold: 0.5,
      participationCount: 5,
      activeCount: 10
    };

    const evaluation = quorum.evaluateQuorum(pack);
    assert.strictEqual(evaluation.quorumReached, true);
    assert.strictEqual(evaluation.status, 'won');
    assert.strictEqual(evaluation.decision, 'YES');
    assert.strictEqual(evaluation.approvalRate, 0.8);
  });
}

async function testProposalLifecycleCalculus() {
  console.log('\n--- Challenge 6: Canonical Proposal Lifecycle Calculus ---');
  console.log('  Competitor Failure: Fails to detect mathematical impossibility of passage early.');

  await runTest('6.1 Canonical rejection detects when remaining votes cannot mathematically pass threshold', () => {
    // 10 active nodes, threshold 0.60
    // 4 voted NO, 1 voted YES, 5 remaining
    // Max possible YES: 1 + 5 = 6 out of 10 = 0.60 -> not strictly < 0.60 yet (still open)
    const openStatus = quorum.resolveProposalStatus({
      active: 10,
      participation: 5,
      yes: 1,
      no: 4,
      threshold: 0.65
    });
    // Max possible YES: (1 + 5) / 10 = 6/10 = 0.60 < 0.65 -> Mathematically rejected early!
    assert.strictEqual(openStatus.status, 'rejected');
  });

  await runTest('6.2 Expired proposal with zero active nodes returns expired status', () => {
    const status = quorum.resolveProposalStatus({ active: 0, participation: 0, yes: 0, no: 0 });
    assert.strictEqual(status.status, 'expired');
    assert.strictEqual(status.reason, 'no_active_nodes');
  });
}

async function main() {
  console.log('======================================================================');
  console.log('   GenOS Multi-Agent Coordination & Game Theory Benchmark Suite');
  console.log('======================================================================');

  await testBrierCalibrationAndGameTheory();
  await testQuorumStrictNeutrality();
  await testSwarmDeadlockDetection();
  await testShannonEntropyCollapseSentinel();
  await testParticipationFloorProtection();
  await testProposalLifecycleCalculus();

  console.log('\n======================================================================');
  console.log(`TOTAL MULTI-AGENT CONSENSUS TESTS: ${passed + failed}`);
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
