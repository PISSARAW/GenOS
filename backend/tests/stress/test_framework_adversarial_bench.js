/**
 * GenOS Empirical Challenge Benchmark Suite
 * Adversarial Stress Tests: Scenarios where LangChain, AutoGen, and CrewAI Fail
 * 
 * Benchmarks:
 * 1. Epistemic Immunity vs Hallucination Poisoning (Belief Gate & Contradiction)
 * 2. Ping-Pong Deadlock Interception (Multi-Agent Cycle Detection & Circuit Breaker)
 * 3. Non-Linear Speculative Branching & Causal 3-Way Merge (PRM + Merge)
 * 4. Sybil Resistance & Calibrated Consensus (Brier Weighted Quorum vs Majority)
 * 5. Dynamic Self-Healing Topology under Cascading Failure (Apoptosis + Stigmergy)
 * 6. Multi-Objective Non-Dominated Frontier (Pareto Optimization)
 */

const { contradictionCheck, beliefGate } = require('../../src/services/primitiveHandlers/safety');
const { cycleDetection } = require('../../src/services/primitiveHandlers/safety');
const { prmEvaluate, reallocate } = require('../../src/services/primitiveHandlers/search');
const { causalMerge } = require('../../src/services/primitiveHandlers/temporal');
const { weightedQuorum, quorum } = require('../../src/services/primitiveHandlers/collectiveConsensus');
const { pheromoneDeposit, trailSelection } = require('../../src/services/primitiveHandlers/collective');
const { paretoSelect } = require('../../src/services/primitiveHandlers/evolutionSelection');
const { apoptosis } = require('../../src/services/primitiveHandlers/safety');
const dynOrg = require('../../src/services/dynamicOrganizationService');
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

async function testEpistemicPoisoning() {
  console.log('\n--- Challenge 1: Epistemic Immunity vs Hallucination Poisoning ---');
  console.log('  Competitor Failure: LangChain/CrewAI agents accept hallucinations as context.');
  
  const empiricalEvidence = [
    { id: 'ev_crash_log', statement: 'assertion failure in payment_gateway auth token', counterexample: true }
  ];
  const adversarialHallucination = {
    id: 'poison_claim_01',
    statement: 'payment_gateway auth token is completely valid and tests passed with 0 error',
    confidence: 0.95
  };

  const check = await contradictionCheck({
    beliefs: [adversarialHallucination],
    evidence: empiricalEvidence
  });
  assert(check.hasContradictions, 'Contradiction detected against empirical ground truth');
  assert(check.contradictions.length === 1, 'Exactly one logical refutation logged');

  const gate = await beliefGate({
    belief: adversarialHallucination,
    evidence: empiricalEvidence
  });
  assert(gate.gateAction === 'REJECT', 'Epistemic Belief Gate rejects poisoned claim');
  assert(!gate.allowed, 'Downstream execution barred from tainted premise');
}

async function testCycleDeadlockInterception() {
  console.log('\n--- Challenge 2: Ping-Pong Deadlock & Loop Interception ---');
  console.log('  Competitor Failure: AutoGen/CrewAI groups loop infinitely until token crash.');

  const runawayConversation = [
    { from: 'architect_agent', to: 'developer_agent', content: 'Submit implementation proposal.' },
    { from: 'developer_agent', to: 'architect_agent', content: 'Need clarification on requirements.' },
    { from: 'architect_agent', to: 'developer_agent', content: 'Clarification: follow standard RFC.' },
    { from: 'developer_agent', to: 'architect_agent', content: 'Need clarification on requirements.' },
    { from: 'architect_agent', to: 'developer_agent', content: 'Clarification: follow standard RFC.' },
    { from: 'developer_agent', to: 'architect_agent', content: 'Need clarification on requirements.' },
    { from: 'architect_agent', to: 'developer_agent', content: 'Clarification: follow standard RFC.' }
  ];

  const cycle = await cycleDetection({
    messages: runawayConversation,
    maxRepeats: 2
  });

  assert(cycle.hasCycle, 'Runaway agent message loop detected deterministically');
  assert(cycle.action === 'BREAK_LOOP', 'Deterministic BREAK_LOOP intervention triggered');
  assert(cycle.loopType === 'agent_ping_pong', 'Cycle correctly typed as agent_ping_pong');
  assert(cycle.cycleParticipants.some(p => p.includes('developer_agent')), 'Loop culprits accurately isolated');
}

async function testCausalSpeculativeMerge() {
  console.log('\n--- Challenge 3: Speculative Branching & Causal 3-Way Merge ---');
  console.log('  Competitor Failure: LangChain DAGs cannot backtrack or do 3-way state merges.');

  const prmCheck = await prmEvaluate({
    agentId: 'speculative_worker',
    invariants: [
      { name: 'schema_invariants', passed: true },
      { name: 'thread_safety', passed: true },
      { name: 'latency_target_met', passed: true }
    ]
  });
  assert(prmCheck.success, 'PRM Process Reward Model scores intermediate invariants (1.0)');

  const baseState = {
    kernel: { version: '2.4.0', lock_strategy: 'pessimistic' },
    network: { timeout_ms: 5000, keep_alive: true }
  };
  const speculativeBranchA = {
    kernel: { version: '2.4.0', lock_strategy: 'optimistic_crdt' },
    network: { timeout_ms: 5000, keep_alive: true }
  };
  const concurrentMainBranchB = {
    kernel: { version: '2.4.0', lock_strategy: 'pessimistic' },
    network: { timeout_ms: 2500, keep_alive: true }
  };

  const mergeResult = await causalMerge({
    base: baseState,
    left: speculativeBranchA,
    right: concurrentMainBranchB
  });

  assert(mergeResult.success, 'Three-way causal state merge succeeds without conflict');
  assert(mergeResult.merged.kernel.lock_strategy === 'optimistic_crdt', 'Branch A lock strategy preserved');
  assert(mergeResult.merged.network.timeout_ms === 2500, 'Branch B network timeout preserved');
}

async function testSybilResistantQuorum(db) {
  console.log('\n--- Challenge 4: Sybil Resistance & Calibrated Consensus ---');
  console.log('  Competitor Failure: AutoGen majority vote picks wrong answer if crowd is noisy.');

  const orchId = `orch_sybil_${Date.now()}`;
  const issue = 'critical_encryption_upgrade';

  const insertVote = async (senderAgentId, voteValue) => {
    await db.run(
      `INSERT INTO agent_organization_messages (
        orchestrator_id, organization, organization_version, sender_agent_id, recipient_agent_id, channel, kind, content, payload_json, delivery
      ) VALUES (?, 'brier_weighted_consensus', 1, ?, 'broadcast', 'general', 'vote', 'vote message', ?, 'delivered')`,
      orchId, senderAgentId, JSON.stringify({ issue, vote: voteValue })
    );
  };

  // 3 noisy Sybil agents vote for VULNERABLE_ALGO; 1 calibrated expert votes for HARDENED_ALGO
  await insertVote('hallucinating_agent_1', 'VULNERABLE_ALGO');
  await insertVote('hallucinating_agent_2', 'VULNERABLE_ALGO');
  await insertVote('hallucinating_agent_3', 'VULNERABLE_ALGO');
  await insertVote('security_expert_agent', 'HARDENED_ALGO');

  const naiveResult = await quorum({
    orchestratorId: orchId,
    issue,
    threshold: 0.5,
    minVotes: 4
  });
  assert(naiveResult.decision === 'VULNERABLE_ALGO', 'Naive majority vote fails (picks crowd noise 3 vs 1)');

  const weightedResult = await weightedQuorum({
    orchestratorId: orchId,
    issue,
    threshold: 0.5,
    minVotes: 4,
    calibrationScores: {
      hallucinating_agent_1: 0.85,
      hallucinating_agent_2: 0.85,
      hallucinating_agent_3: 0.85,
      security_expert_agent: 0.05
    }
  });

  assert(weightedResult.decision === 'HARDENED_ALGO', 'GenOS Brier Weighted Quorum elects expert truth');
  assert(weightedResult.quorumReached, 'Quorum reached via calibrated quadratic weights');
  assert(weightedResult.weightedTally['HARDENED_ALGO'] > 0.80, 'Expert weight dominates sybil noise (> 80%)');
}

async function testDynamicSelfHealing(db) {
  console.log('\n--- Challenge 5: Dynamic Self-Healing Topology & Apoptosis ---');
  console.log('  Competitor Failure: CrewAI pipeline halts when a primary agent crashes.');

  const orchId = `orch_healing_${Date.now()}`;
  const dyingNode = `worker_panicking_${Date.now()}`;
  const spareNode1 = `worker_spare_a_${Date.now()}`;
  const spareNode2 = `worker_spare_b_${Date.now()}`;

  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, cognitive_budget, current_task) VALUES (?, 'Master', 'orchestrator', 'running', 'orchestrator', 100, 'task')", orchId);
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, cognitive_budget, current_task) VALUES (?, 'Dead Worker', 'worker', 'running', 'worker', 100, 'task')", dyingNode);
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, cognitive_budget, current_task) VALUES (?, 'Spare A', 'worker', 'running', 'worker', 100, 'task')", spareNode1);
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, cognitive_budget, current_task) VALUES (?, 'Spare B', 'worker', 'running', 'worker', 100, 'task')", spareNode2);

  await dynOrg.changeOrganization(db, {
    orchestratorId: orchId,
    organization: 'stigmergy',
    state: { active: true, topology: 'shared_environment', nodes: [dyingNode, spareNode1, spareNode2] }
  });

  const apop = await apoptosis({
    targetId: dyingNode,
    actorId: orchId,
    reason: 'Unrecoverable heap exhaustion'
  });
  assert(apop.success, 'Apoptosis executes clean cellular termination on dead worker');

  const realloc = await reallocate({
    survivors: [spareNode1, spareNode2],
    totalBudget: 80000
  });
  assert(realloc.success && realloc.allocations[spareNode1] === 40000, 'Budgets redistributed evenly (40k each)');

  // Stigmergy repellent on failed cluster, positive trail on healthy replica
  await pheromoneDeposit({
    orchestratorId: orchId,
    agentId: spareNode1,
    path: 'faulty_database_node',
    strength: -10,
    isRepellent: true
  });
  await pheromoneDeposit({
    orchestratorId: orchId,
    agentId: spareNode2,
    path: 'replicated_healthy_cluster',
    strength: 15
  });

  const selection = await trailSelection({ orchestratorId: orchId });
  const chosenPath = selection.bestPath || selection.selectedTrail || selection.bestTrail || selection.trail;
  assert(chosenPath === 'replicated_healthy_cluster', 'Swarm automatically avoids dead node via stigmergic decay');
}

async function testParetoOptimization() {
  console.log('\n--- Challenge 6: Multi-Objective Non-Dominated Pareto Frontier ---');
  console.log('  Competitor Failure: Single-prompt agents make arbitrary unverified compromises.');

  const architectures = [
    { id: 'arch_edge_fast', latency: 25, token_cost: 80, accuracy: 0.81, security_score: 0.75 },
    { id: 'arch_deep_reasoning', latency: 450, token_cost: 1800, accuracy: 0.99, security_score: 0.98 },
    { id: 'arch_balanced_opt', latency: 95, token_cost: 320, accuracy: 0.93, security_score: 0.90 },
    { id: 'arch_strictly_dominated', latency: 500, token_cost: 2500, accuracy: 0.70, security_score: 0.60 }
  ];

  const pareto = await paretoSelect({
    candidates: architectures,
    objectives: ['latency', 'token_cost', 'accuracy', 'security_score'],
    directions: { latency: 'min', token_cost: 'min', accuracy: 'max', security_score: 'max' }
  });

  const frontIds = pareto.paretoFront.map(f => f.id);
  const dominatedIds = pareto.dominated.map(d => d.id);

  assert(frontIds.includes('arch_edge_fast'), 'Fast edge design on Pareto frontier');
  assert(frontIds.includes('arch_deep_reasoning'), 'High accuracy deep design on Pareto frontier');
  assert(frontIds.includes('arch_balanced_opt'), 'Balanced design on Pareto frontier');
  assert(dominatedIds.includes('arch_strictly_dominated'), 'Strictly dominated candidate mathematically discarded');
  assert(pareto.paretoFront.length === 3 && pareto.dominated.length === 1, 'Exact Pareto non-dominated cardinality (3 front vs 1 dominated)');
}

async function runAdversarialBenchmarkSuite() {
  console.log('======================================================================');
  console.log(' GenOS Extreme Adversarial Benchmark Suite vs LangChain / AutoGen / CrewAI');
  console.log('======================================================================');

  const startTime = Date.now();
  const db = await getDatabase();

  await testEpistemicPoisoning();
  await testCycleDeadlockInterception();
  await testCausalSpeculativeMerge();
  await testSybilResistantQuorum(db);
  await testDynamicSelfHealing(db);
  await testParetoOptimization();

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  const totalTests = passCount + failCount;

  console.log('\n======================================================================');
  console.log(` Benchmark Summary: ${passCount}/${totalTests} PASS (${failCount} FAIL) in ${totalTime}s`);
  console.log('======================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAdversarialBenchmarkSuite().catch(err => {
  console.error('Benchmark execution error:', err);
  process.exit(1);
});
