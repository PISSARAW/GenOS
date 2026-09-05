const assert = require('assert');
const { getDatabase } = require('../src/db');
const swarmSentinel = require('../src/services/swarmSentinelService');
const agentEvolution = require('../src/services/agentEvolutionService');
const genetics = require('../src/services/geneticsService');
const arenaTask = require('../src/services/arenaTaskEvaluation');

async function testSwarmSentinel() {
  console.log('--- 1. Testing Swarm Sentinel (Shannon Entropy & Deadlock) ---');
  const agentId = 'test-agent-loop-01';

  // 1. Simulating 7 identical actions (frozen repetitive loop)
  let lastResult = null;
  for (let i = 0; i < 7; i++) {
    lastResult = swarmSentinel.inspectEvent(agentId, {
      eventType: 'AGENT_STEP',
      action: 'REPEAT_ACTION',
      payload: { toolName: 'genos_inspect' }
    });
  }

  assert(lastResult.intervention === true, 'Sentinel must intervene on infinite repetitive loop');
  assert.strictEqual(lastResult.action, 'HALT_COLLAPSE', 'Sentinel must order HALT_COLLAPSE');
  assert.strictEqual(lastResult.state, 'COLLAPSE_DEADLOCK', 'Drift state must be COLLAPSE_DEADLOCK');
  assert(lastResult.normalizedEntropy < 0.20, 'Entropy must be collapsed below threshold');
  console.log(`  ✅ PASS: Shannon entropy collapse detected ($H(A) = ${lastResult.rawEntropy}, norm = ${lastResult.normalizedEntropy})`);

  // 2. Clear agent
  swarmSentinel.clearAgent(agentId);
  const clearedMetrics = swarmSentinel.getAgentEntropy(agentId);
  assert.strictEqual(clearedMetrics.sampleSize, 0, 'Agent history must be cleared');
  console.log('  ✅ PASS: Agent entropy window reset verified');

  // 3. Circular deadlock detection
  const circularMessages = [
    { sender: 'worker-A', recipient: 'worker-B', hasDiff: false },
    { sender: 'worker-B', recipient: 'worker-C', hasDiff: false },
    { sender: 'worker-C', recipient: 'worker-A', hasDiff: false }
  ];
  const deadlockResult = swarmSentinel.inspectMessageDeadlocks(circularMessages);
  assert(deadlockResult.deadlockDetected === true, 'Circular deadlock A -> B -> C -> A must be detected');
  assert(deadlockResult.circularDeadlocks.length > 0, 'Must report the circular cycle');
  console.log(`  ✅ PASS: Circular deadlock detected: ${deadlockResult.circularDeadlocks[0].cycle}`);
}

async function testGeneticEvolution() {
  console.log('--- 2. Testing Genetic Evolution & Lineage Persistence ---');
  const db = await getDatabase();

  const orchestrator = {
    id: 'orch-prime-001',
    name: 'Prime Orchestrator',
    role: 'orchestrator',
    workspace_id: 'ws-test-01'
  };

  const assignment = {
    role: 'security_specialist',
    label: 'Security Branch',
    strategy: 'adversarial-falsification'
  };

  // 1. Genetic Crossover for real worker
  const evolution = agentEvolution.evolveWorkerGenome(orchestrator, assignment, {
    crossoverStrategy: 'uniform',
    mutationRate: 0.1
  });

  assert(evolution.genes, 'Must produce evolved child genes');
  assert(Array.isArray(evolution.genes.tools) && evolution.genes.tools.length > 0, 'Child must inherit tools');
  assert(typeof evolution.genes.temp === 'number', 'Child must have evolved temperature');
  console.log(`  ✅ PASS: Genetic crossover created genome (tools: [${evolution.genes.tools.join(', ')}], temp: ${evolution.genes.temp})`);

  // 2. Persist in lineage_nodes and lineage_edges
  const workerId = `worker-evolved-${Date.now()}`;
  await agentEvolution.recordWorkerLineage(db, {
    agentId: workerId,
    name: 'Evolved Security Specialist',
    role: 'security_specialist',
    workspaceId: 'ws-test-01'
  }, {
    parentId: orchestrator.id,
    genes: evolution.genes,
    parents: evolution.parents,
    predictedFitness: evolution.predictedFitness
  });

  const nodeRow = await db.get('SELECT * FROM lineage_nodes WHERE id = ?', workerId);
  assert(nodeRow, 'Lineage node must be persisted in SQLite');
  assert.strictEqual(nodeRow.node_type, 'agent');

  const edgeRow = await db.get('SELECT * FROM lineage_edges WHERE target_node_id = ?', workerId);
  assert(edgeRow, 'Lineage edge must link parent to evolved worker');
  console.log(`  ✅ PASS: Lineage node & edge persisted in SQLite (id: ${workerId}, parent: ${edgeRow.source_node_id})`);

  // 3. Genomic outcome recording
  await agentEvolution.recordGenomicOutcome(workerId, 'success', 92);
  const updatedNode = await db.get('SELECT score, state_summary FROM lineage_nodes WHERE id = ?', workerId);
  assert.strictEqual(updatedNode.score, 0.92);
  console.log('  ✅ PASS: Real mission outcome updated fitness score in lineage_nodes');

  // 4. Allele frequency analysis connected to real lineage
  const alleleAnalysis = await genetics.analyzeAlleles();
  assert(alleleAnalysis.selectionAnalysisAvailable === true, 'Selection analysis must be available with real scored lineage');
  assert.strictEqual(alleleAnalysis.analysisBasis, 'lineage-and-recorded-decisions');
  console.log(`  ✅ PASS: Allele analysis updated with real lineage correlation (${alleleAnalysis.geneFrequencyMatrix[0].successCorrelation})`);
}

async function testArenaTaskEvaluation() {
  console.log('--- 3. Testing Arena Pareto Task Evaluation on Real Dossiers ---');

  const dossiers = [
    {
      workerId: 'worker-fast-cheap',
      name: 'Fast & Cheap Worker',
      executionTimeMs: 12,
      tokens: 450,
      evidenceReport: {
        outcome: 'success',
        claims: [{ statement: 'Claim A', evidence: ['source1'] }],
        uncertainties: ['Minor doubt'],
        tests: ['test 1 ok']
      }
    },
    {
      workerId: 'worker-thorough-expensive',
      name: 'Thorough & Deep Worker',
      executionTimeMs: 95,
      tokens: 4200,
      evidenceReport: {
        outcome: 'success',
        claims: [
          { statement: 'Claim A', evidence: ['source1'] },
          { statement: 'Claim B', evidence: ['source2'] },
          { statement: 'Claim C', evidence: ['source3'] }
        ],
        uncertainties: [],
        tests: ['test 1 ok', 'test 2 ok', 'test 3 ok']
      }
    },
    {
      workerId: 'worker-dominated-slow-poor',
      name: 'Dominated Slow Worker',
      executionTimeMs: 150,
      tokens: 5000,
      evidenceReport: {
        outcome: 'failed',
        claims: [],
        uncertainties: ['Uncertainty 1', 'Uncertainty 2'],
        tests: ['test 1 failed']
      }
    },
    {
      workerId: 'worker-balanced',
      name: 'Balanced Worker',
      executionTimeMs: 35,
      tokens: 1800,
      evidenceReport: {
        outcome: 'success',
        claims: [
          { statement: 'Claim A', evidence: ['source1'] },
          { statement: 'Claim B', evidence: ['source2'] }
        ],
        uncertainties: [],
        tests: ['test 1 ok', 'test 2 ok']
      }
    }
  ];

  const paretoResult = arenaTask.evaluateDossiersPareto(dossiers);

  assert(paretoResult.paretoFrontCount >= 2, 'Pareto front must have non-dominated trade-off solutions');
  assert(paretoResult.dominatedSolutions.length >= 1, 'Dominated worker must be isolated');
  assert(paretoResult.kneePoint, 'Must identify the optimal Knee-Point compromise solution');

  const dominatedIds = paretoResult.dominatedSolutions.map(s => s.candidateId);
  assert(dominatedIds.includes('worker-dominated-slow-poor'), 'worker-dominated-slow-poor must be dominated');

  console.log(`  ✅ PASS: Pareto Front identified ${paretoResult.paretoFrontCount} non-dominated solutions`);
  console.log(`  ✅ PASS: Knee-Point optimal compromise selected: ${paretoResult.kneePoint.name} (${paretoResult.kneePoint.candidateId})`);
  console.log(`  ✅ PASS: Leaderboard computed with dynamic ELO ratings (Top: ${paretoResult.leaderboard[0].name}, ELO: ${paretoResult.leaderboard[0].eloRating})`);
}

async function main() {
  console.log('=== STARTING ACTIVE CELL BIOLOGY, SWARM & ARENA SUITE ===\n');
  await testSwarmSentinel();
  console.log('');
  await testGeneticEvolution();
  console.log('');
  await testArenaTaskEvaluation();
  console.log('\n========================================');
  console.log('ALL ACTIVE BIOLOGY, SWARM & ARENA TESTS PASSED');
  console.log('========================================');
}

main().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
