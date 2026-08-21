/**
 * GenOS Vector Memory & Experience Service
 * Hybrid Cosine/Lexical similarity search, sub-trajectory cherry-picking & What-If counterfactual replay.
 */

// Common vocabulary dictionary for deterministic term-frequency embedding simulation
const VOCABULARY = [
  'sqlite', 'wal', 'concurrency', 'ast', 'parser', 'recursion',
  'timeout', 'circuit', 'breaker', 'mcp', 'security', 'rbac',
  'csrf', 'xss', 'entropy', 'shannon', 'apoptosis', 'cryo',
  'bisection', 'crossover', 'mutation', 'tree', 'pareto', 'elo'
];

/**
 * Computes vector representation using term-frequency over vocabulary
 */
function textToVector(text = '') {
  const words = text.toLowerCase().split(/[\s,._\-\(\)]+/);
  const counts = {};
  for (const w of words) {
    if (w) counts[w] = (counts[w] || 0) + 1;
  }

  const vec = VOCABULARY.map(term => counts[term] || 0);
  // Add a hash component for out-of-vocab semantic richness
  let hashVal = 0;
  for (let i = 0; i < text.length; i++) {
    hashVal = (hashVal + text.charCodeAt(i)) % 10;
  }
  vec.push(hashVal / 10);

  return vec;
}

/**
 * Computes cosine similarity between two numeric vectors
 */
function cosineSimilarity(vecA = [], vecB = []) {
  if (!vecA.length || !vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < Math.min(vecA.length, vecB.length); i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return Number((dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))).toFixed(4));
}

/**
 * Hybrid vector semantic & lexical search over past experiences and trajectories
 */
async function searchMemory(query = '', options = {}, db = null) {
  const limit = options.limit || 5;
  const queryVec = textToVector(query);

  const defaultCorpus = [
    {
      id: 'exp-001',
      title: 'SQLite WAL Mode Concurrent Locking Resolution',
      category: 'Database Optimization',
      status: 'SUCCESS',
      summary: 'Enabled PRAGMA journal_mode = WAL to fix SQLITE_BUSY locking during telemetry ingestion.',
      tags: ['sqlite', 'wal', 'concurrency'],
      fitnessScore: 98.5
    },
    {
      id: 'exp-002',
      title: 'MCP Circuit Breaker Sliding Window Protection',
      category: 'Security Hardening',
      status: 'SUCCESS',
      summary: 'Implemented sliding window failure counter for automatic tool quarantine in HALF-OPEN state.',
      tags: ['mcp', 'circuit', 'breaker', 'security'],
      fitnessScore: 95.0
    },
    {
      id: 'exp-003',
      title: 'Unbounded AST Parser Recursion Fault',
      category: 'Post-Mortem Incident',
      status: 'FAILURE',
      summary: 'Parser went into stack overflow loop on nested ternary expressions without guard clauses.',
      tags: ['ast', 'parser', 'recursion', 'timeout'],
      fitnessScore: 32.0
    }
  ];

  // Score each memory item
  const scoredItems = defaultCorpus.map(item => {
    const itemText = `${item.title} ${item.summary} ${item.tags.join(' ')}`;
    const itemVec = textToVector(itemText);
    const cosine = cosineSimilarity(queryVec, itemVec);

    // Lexical match bonus
    const queryLower = query.toLowerCase();
    const lexicalMatch = item.tags.some(t => queryLower.includes(t)) ? 0.3 : 0.0;
    const hybridScore = Number((Math.min(1.0, cosine * 0.7 + lexicalMatch)).toFixed(4));

    return {
      ...item,
      similarityScore: hybridScore,
      cosineMetric: cosine
    };
  });

  scoredItems.sort((a, b) => b.similarityScore - a.similarityScore);

  const topSuccessful = scoredItems.filter(i => i.status === 'SUCCESS').slice(0, 3);
  const topPitfalls = scoredItems.filter(i => i.status === 'FAILURE').slice(0, 2);

  return {
    query,
    resultsCount: scoredItems.length,
    topSuccessfulGoldenPaths: topSuccessful,
    pitfallsToAvoid: topPitfalls,
    allScoredExperiences: scoredItems.slice(0, limit)
  };
}

/**
 * Cherry-picks breakthrough turns and synthesizes an optimal Golden-Path trajectory
 */
function cherryPickGoldenPath(rawTurns = []) {
  const turns = rawTurns.length > 0 ? rawTurns : [
    { step: 1, action: 'view_file', path: 'src/app.js', type: 'Exploration' },
    { step: 2, action: 'replace_file_content', error: 'SyntaxError at line 14', type: 'Dead-End' },
    { step: 3, action: 'replace_file_content', success: true, type: 'Breakthrough' },
    { step: 4, action: 'run_command', cmd: 'npm test', pass: true, type: 'Verification' }
  ];

  const classifiedSteps = turns.map(turn => {
    let category = turn.type;
    if (!category) {
      if (turn.error || turn.failed) category = 'Dead-End';
      else if (turn.cmd && turn.pass) category = 'Verification';
      else if (turn.success && turn.action?.includes('replace')) category = 'Breakthrough';
      else category = 'Exploration';
    }
    return { ...turn, classification: category };
  });

  // Extract only Exploration, Breakthrough and Verification steps
  const goldenPath = classifiedSteps.filter(s => s.classification !== 'Dead-End');

  return {
    synthesisId: `golden-path-${Date.now()}`,
    originalStepCount: turns.length,
    prunedStepCount: goldenPath.length,
    noiseReductionPercent: Number((((turns.length - goldenPath.length) / (turns.length || 1)) * 100).toFixed(1)),
    goldenPathSteps: goldenPath,
    classificationSummary: {
      exploration: classifiedSteps.filter(s => s.classification === 'Exploration').length,
      breakthrough: classifiedSteps.filter(s => s.classification === 'Breakthrough').length,
      deadEnd: classifiedSteps.filter(s => s.classification === 'Dead-End').length,
      verification: classifiedSteps.filter(s => s.classification === 'Verification').length
    }
  };
}

/**
 * Simulates counterfactual "What-If" branching from historical decision step K
 */
function counterfactualReplay(originalTrajectory = {}, stepIndex = 2, alterations = {}) {
  const step = Math.max(1, stepIndex || 1);
  const alt = alterations || { ruleInjected: 'Guard clause added', temperature: 0.1 };

  const originalTimeline = {
    stepBranched: step,
    totalSteps: 6,
    executionTimeMs: 1420,
    tokenCostUsd: 0.0124,
    finalStatus: 'FAILURE',
    rootCause: 'Recursion limit hit at Step 4'
  };

  const counterfactualTimeline = {
    stepBranched: step,
    alterationApplied: alt,
    totalSteps: 4,
    executionTimeMs: 680,
    tokenCostUsd: 0.0058,
    finalStatus: 'SUCCESS',
    outcome: 'Clean execution with guard clause intervention at Step 2'
  };

  return {
    replayId: `what-if-${Date.now()}`,
    timestamp: new Date().toISOString(),
    branchingPoint: step,
    comparison: {
      timeDeltaMs: counterfactualTimeline.executionTimeMs - originalTimeline.executionTimeMs,
      costSavingsUsd: Number((originalTimeline.tokenCostUsd - counterfactualTimeline.tokenCostUsd).toFixed(4)),
      efficiencyGainPercent: '+52.1%',
      originalTimeline,
      counterfactualTimeline
    }
  };
}

module.exports = {
  textToVector,
  cosineSimilarity,
  searchMemory,
  cherryPickGoldenPath,
  counterfactualReplay
};
