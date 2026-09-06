/**
 * GenOS Empirical Challenge Harness - Vector Memory & Workspace Causal Bisection Stress
 * Stress-tests TF-IDF cosine similarity, noisy query semantic search, and O(log N) bisection on deep histories (>20 snapshots).
 */

const {
  textToVector,
  cosineSimilarity,
  searchMemory,
  cherryPickGoldenPath,
  counterfactualReplay
} = require('../../src/services/vectorMemoryService');

const {
  diffWorkspaces,
  bisectAnomaly,
  remediateRollback
} = require('../../src/services/bisectionService');

const {
  crossoverGenome,
  analyzeAlleles
} = require('../../src/services/geneticsService');

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
 * 1. Vector Memory & Cosine Similarity on Empty/Noisy/Gibberish Queries
 */
async function testVectorMemoryNoisyQueries() {
  console.log('\n--- Memory Challenge 1: Vector Memory & Noisy Query Handling ---');

  // Case A: Empty Query
  const emptyVec = textToVector('');
  const emptySim = cosineSimilarity(emptyVec, emptyVec);
  assert(emptySim === 0 || emptySim === 1.0, 'Empty vector similarity does not throw or return NaN');

  const emptySearch = await searchMemory('');
  assert(emptySearch.allScoredExperiences.length > 0, 'Empty query returns experiences ranked by default metrics');
  assert(emptySearch.allScoredExperiences.every(e => !isNaN(e.similarityScore)), 'All similarity scores are valid numbers');

  // Case B: Noisy Nonce / Gibberish Query
  const noisyQuery = '!!!@@@### $$$%%%^^^ &&&***()_+ 1234567890 zyxwvutsrqponmlkjihgfedcba';
  const noisySearch = await searchMemory(noisyQuery);
  assert(noisySearch.resultsCount >= 3, 'All corpus documents evaluated against noisy query');
  assert(noisySearch.allScoredExperiences.length > 0, 'Results returned without error');

  // Case C: Exact Lexical & Semantic Hybrid Boost
  const exactQuery = 'sqlite wal concurrency';
  const exactSearch = await searchMemory(exactQuery);
  assert(exactSearch.topSuccessfulGoldenPaths.length > 0, 'Returns golden path for exact domain query');
  assert(exactSearch.topSuccessfulGoldenPaths[0].id === 'exp-001', 'Ranked SQLite WAL experience #1');
}

/**
 * 2. Cherry-Picking Golden Path Trajectories
 */
function testGoldenPathSynthesis() {
  console.log('\n--- Memory Challenge 2: Trajectory Cherry-Picking Synthesis ---');

  const messyTurns = [
    { step: 1, action: 'view_file', path: 'src/app.js', type: 'Exploration' },
    { step: 2, action: 'replace_file_content', error: 'SyntaxError', type: 'Dead-End' },
    { step: 3, action: 'replace_file_content', error: 'TypeError', type: 'Dead-End' },
    { step: 4, action: 'replace_file_content', success: true, type: 'Breakthrough' },
    { step: 5, action: 'run_command', error: 'Assertion failed', type: 'Dead-End' },
    { step: 6, action: 'run_command', pass: true, type: 'Verification' }
  ];

  const result = cherryPickGoldenPath(messyTurns);
  assert(result.originalStepCount === 6, 'Original step count is 6');
  assert(result.prunedStepCount === 3, 'Filtered out 3 dead-end turns');
  assert(result.noiseReductionPercent === 50.0, 'Noise reduction is exactly 50.0%');
  assert(result.goldenPathSteps.every(s => s.classification !== 'Dead-End'), 'All dead-ends removed from golden path');
}

/**
 * 3. Deep Causal Bisection (>20 Snapshots Scale Stress)
 */
function testDeepCausalBisection() {
  console.log('\n--- Workspace Challenge 3: Causal Bisection on Deep Histories ---');

  // Generate deep history of 30 snapshots with culprit at step 17
  const snapshotCount = 30;
  const culpritStep = 17;
  const history = [];

  for (let s = 1; s <= snapshotCount; s++) {
    history.push({
      step: s,
      hash: `snap-hash-00${s}`,
      agent: s === culpritStep ? 'culprit_agent_x' : 'safe_agent',
      healthy: s < culpritStep, // Fails from culpritStep onward
      desc: s === culpritStep ? 'Injected infinite loop in AST parser' : `Regular work step ${s}`
    });
  }

  const startBisection = Date.now();
  const bisectResult = bisectAnomaly(history);
  const bisectDuration = Date.now() - startBisection;

  console.log(`  Bisected ${snapshotCount} snapshots in ${bisectDuration}ms (${bisectResult.bisectionIterationsRequired} iterations)`);
  assert(bisectResult.bisectionComplete === true, 'Bisection successfully completed');
  assert(bisectResult.totalSnapshotsSearched === 30, 'Searched all 30 snapshots in deep history');
  assert(bisectResult.culpritReport.stepNumber === culpritStep, `Correctly isolated culprit at step ${culpritStep}`);
  assert(bisectResult.bisectionIterationsRequired <= Math.ceil(Math.log2(snapshotCount)) + 1, 'Complexity respects O(log N) bound');

  // Test Boundary A: Culprit at Index 0 (Step 1)
  const genesisBadHistory = history.map((h, i) => ({ ...h, healthy: false }));
  const genesisResult = bisectAnomaly(genesisBadHistory);
  assert(genesisResult.culpritReport.stepNumber === 1, 'Correctly isolated culprit when anomaly starts at Step 1');

  // Test Boundary B: Culprit at Last Step (Step 30)
  const latestBadHistory = history.map((h, i) => ({ ...h, healthy: i < 29 }));
  const latestResult = bisectAnomaly(latestBadHistory);
  assert(latestResult.culpritReport.stepNumber === 30, 'Correctly isolated culprit when anomaly occurs at final Step 30');

  // Test Scale: 1,000 Snapshots
  const thousandHistory = Array.from({ length: 1000 }, (_, i) => ({
    step: i + 1,
    hash: `snap-${i + 1}`,
    agent: i + 1 >= 642 ? 'anomaly_agent' : 'clean_agent',
    healthy: i + 1 < 642,
    desc: `Step ${i + 1}`
  }));

  const thousandBisect = bisectAnomaly(thousandHistory);
  assert(thousandBisect.culpritReport.stepNumber === 642, 'Correctly found culprit in 1,000 snapshot history');
  assert(thousandBisect.bisectionIterationsRequired <= 11, '1,000 snapshots resolved in <= 11 steps (log2(1000) ~ 9.96)');
}

/**
 * 4. Invariant Rollback & Surgical Reverse Diff
 */
function testRollbackIntegrity() {
  console.log('\n--- Workspace Challenge 4: Invariant Rollback Integrity ---');

  const culpritReport = {
    stepNumber: 17,
    snapshotHash: 'snap-hash-0017',
    culpritAgentId: 'culprit_agent_x',
    targetFile: 'src/services/parser.js'
  };

  const rollbackRes = remediateRollback('ws-genos-core', culpritReport);
  assert(rollbackRes.success === true, 'Rollback reports successful status');
  assert(rollbackRes.rolledBackCulpritStep === 17, 'Rollback references culprit step 17');
  assert(rollbackRes.remediationPatch.file === 'src/services/parser.js', 'Patch targets culprit file');
  assert(rollbackRes.remediationPatch.preservedAgentFiles.length >= 2, 'Preserves parallel branch agent files');
}

/**
 * 5. Genetic Crossover & Allele Frequency Mining
 */
async function testGeneticsAndAlleles() {
  console.log('\n--- Genetics Challenge 5: Crossover & Allele Mining ---');

  const alleles = await analyzeAlleles();
  assert(alleles.totalAllelesTracked >= 6, 'Tracks standard gene alleles');
  assert(alleles.unclassifiedAlleles.length > 0, 'Keeps recorded alleles unclassified without fitness evidence');

  // Crossover recombination with 15% mutation rate
  const crossover = crossoverGenome(null, null, { strategy: 'uniform', mutationRate: 0.15 });
  assert(crossover.childId.startsWith('agent-crossover-'), 'Child genome generated');
  assert(crossover.childGenes.role !== undefined, 'Child inherits role gene');
  assert(crossover.childGenes.strategy !== undefined, 'Child inherits strategy gene');
  assert(Array.isArray(crossover.childGenes.tools), 'Child inherits tool repertoire');
}

async function runMemoryWorkspaceStressSuite() {
  console.log('===============================================================');
  console.log('  VECTOR MEMORY & WORKSPACE CAUSAL BISECTION STRESS HARNESS    ');
  console.log('===============================================================');

  await testVectorMemoryNoisyQueries();
  testGoldenPathSynthesis();
  testDeepCausalBisection();
  testRollbackIntegrity();
  await testGeneticsAndAlleles();

  console.log(`\nMemory & Workspace Suite Completed: ${passedTests} PASSED, ${failedTests} FAILED\n`);
  return { passed: passedTests, failed: failedTests };
}

if (require.main === module) {
  runMemoryWorkspaceStressSuite().then(res => {
    process.exitCode = res.failed === 0 ? 0 : 1;
  });
}

module.exports = { runMemoryWorkspaceStressSuite };
