/**
 * GenOS Empirical Challenge Harness - Arena & Multi-Objective Pareto Stress
 * Stress-tests Pareto frontier calculation, Knee-point detection, and collinear/extreme candidate sets.
 */

const { calculateParetoFront, runTournament, calculateElo } = require('../../src/services/arenaService');

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
 * 1. Single Candidate Point Test
 */
function testSinglePoint() {
  console.log('\n--- Arena Challenge 1: Single Candidate Point ---');
  const single = [
    { solverKey: 'single_bot', executionTimeMs: 300, tokenCostUSD: 0.002, fitnessScore: 90.0, adversarialPassRate: 85.0 }
  ];

  const result = calculateParetoFront(single);
  assert(result.totalEvaluated === 1, 'Total evaluated equals 1');
  assert(result.paretoFrontCount === 1, 'Pareto front contains exactly 1 point');
  assert(result.dominatedSolutions.length === 0, 'Zero dominated solutions');
  assert(result.kneePointRecommendation !== null, 'Knee point recommendation exists');
  assert(result.kneePointRecommendation.solverKey === 'single_bot', 'Knee point is the solitary candidate');
}

/**
 * 2. Collinear and Identical Points Test
 */
function testCollinearAndIdenticalPoints() {
  console.log('\n--- Arena Challenge 2: Collinear & Degenerate Points ---');
  // Points along a straight tradeoff line in 4D space
  const collinearPoints = [
    { solverKey: 'bot_1', executionTimeMs: 100, tokenCostUSD: 0.010, fitnessScore: 70.0, adversarialPassRate: 70.0 },
    { solverKey: 'bot_2', executionTimeMs: 200, tokenCostUSD: 0.008, fitnessScore: 80.0, adversarialPassRate: 80.0 },
    { solverKey: 'bot_3', executionTimeMs: 300, tokenCostUSD: 0.006, fitnessScore: 90.0, adversarialPassRate: 90.0 },
    { solverKey: 'bot_4', executionTimeMs: 400, tokenCostUSD: 0.004, fitnessScore: 95.0, adversarialPassRate: 95.0 }
  ];

  const result = calculateParetoFront(collinearPoints);
  assert(result.paretoFrontCount === 4, 'All non-dominated tradeoff points preserved on Pareto frontier');
  assert(result.dominatedSolutions.length === 0, 'No points falsely dominated on tradeoff line');
  assert(result.kneePointRecommendation !== null, 'Knee-point resolved on collinear tradeoff curve');

  // Degenerate identical points
  const identicalPoints = [
    { solverKey: 'clone_A', executionTimeMs: 250, tokenCostUSD: 0.005, fitnessScore: 85.0, adversarialPassRate: 80.0 },
    { solverKey: 'clone_B', executionTimeMs: 250, tokenCostUSD: 0.005, fitnessScore: 85.0, adversarialPassRate: 80.0 },
    { solverKey: 'clone_C', executionTimeMs: 250, tokenCostUSD: 0.005, fitnessScore: 85.0, adversarialPassRate: 80.0 }
  ];

  const identResult = calculateParetoFront(identicalPoints);
  assert(identResult.paretoFrontCount === 3, 'Identical points do not self-dominate (all non-strictly dominated retained)');
  assert(identResult.kneePointRecommendation !== null, 'Knee point cleanly selected among identical candidates');
}

/**
 * 3. 1,000 Candidate Large-Scale Stress Test
 */
function testThousandCandidatesStress() {
  console.log('\n--- Arena Challenge 3: 1,000 Synthetic Candidates Scale Stress ---');
  const count = 1000;
  const candidates = [];

  for (let i = 0; i < count; i++) {
    candidates.push({
      solverKey: `synthetic_solver_${i}`,
      executionTimeMs: 50 + Math.floor(Math.random() * 950),
      tokenCostUSD: Number((0.0005 + Math.random() * 0.02).toFixed(4)),
      fitnessScore: Number((50 + Math.random() * 49.5).toFixed(1)),
      adversarialPassRate: Number((40 + Math.random() * 60).toFixed(1))
    });
  }

  // Inject known strictly dominant champion and strictly dominated laggard
  candidates.push({
    solverKey: 'known_champion',
    executionTimeMs: 40,
    tokenCostUSD: 0.0001,
    fitnessScore: 99.9,
    adversarialPassRate: 100.0
  });

  candidates.push({
    solverKey: 'known_laggard',
    executionTimeMs: 2000,
    tokenCostUSD: 0.50,
    fitnessScore: 10.0,
    adversarialPassRate: 10.0
  });

  const startTime = Date.now();
  const result = calculateParetoFront(candidates);
  const durationMs = Date.now() - startTime;

  console.log(`  Processed ${candidates.length} candidates in ${durationMs}ms`);
  console.log(`  Pareto Frontier size: ${result.paretoFrontCount}, Dominated size: ${result.dominatedSolutions.length}`);

  assert(durationMs < 500, `Execution completed within tight latency budget (${durationMs}ms < 500ms)`);
  assert(result.totalEvaluated === 1002, 'All 1002 candidates evaluated');
  
  const championInPareto = result.paretoFront.some(s => s.solverKey === 'known_champion');
  const laggardInDominated = result.dominatedSolutions.some(s => s.solverKey === 'known_laggard');

  assert(championInPareto, 'Known dominant champion is present in Pareto Frontier');
  assert(laggardInDominated, 'Known dominated laggard is in Dominated Solutions set');
  assert(result.kneePointRecommendation !== null, 'Knee-point successfully computed for 1,000+ points');
}

/**
 * 4. Knee-Point Flat-Dimension Zero-Variance Anomaly Test
 */
function testFlatDimensionZeroVariance() {
  console.log('\n--- Arena Challenge 4: Knee-Point Zero Variance Normalization ---');
  // All candidates have the exact same token cost and pass rate (variance = 0)
  const zeroVariancePoints = [
    { solverKey: 'var_1', executionTimeMs: 100, tokenCostUSD: 0.005, fitnessScore: 70.0, adversarialPassRate: 80.0 },
    { solverKey: 'var_2', executionTimeMs: 200, tokenCostUSD: 0.005, fitnessScore: 85.0, adversarialPassRate: 80.0 },
    { solverKey: 'var_3', executionTimeMs: 300, tokenCostUSD: 0.005, fitnessScore: 95.0, adversarialPassRate: 80.0 }
  ];

  const result = calculateParetoFront(zeroVariancePoints);
  assert(result.kneePointRecommendation !== null, 'Zero-variance dimensions do not produce unhandled NaN crashes');
  assert(typeof result.kneePointRecommendation.solverKey === 'string', 'Valid knee-point solver returned');
}

function runArenaStressSuite() {
  console.log('====================================================');
  console.log('  ARENA & PARETO OPTIMIZATION STRESS TEST HARNESS   ');
  console.log('====================================================');

  testSinglePoint();
  testCollinearAndIdenticalPoints();
  testThousandCandidatesStress();
  testFlatDimensionZeroVariance();

  console.log(`\nArena Suite Completed: ${passedTests} PASSED, ${failedTests} FAILED\n`);
  return { passed: passedTests, failed: failedTests };
}

if (require.main === module) {
  runArenaStressSuite();
}

module.exports = { runArenaStressSuite };
