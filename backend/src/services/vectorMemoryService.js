/**
 * GenOS Vector Memory & Experience Service
 * Hybrid Cosine/Lexical similarity search, sub-trajectory cherry-picking & What-If counterfactual replay.
 */

// Small deterministic vocabulary for local, dependency-free similarity scoring.
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

  if (!db) throw new Error('Database connection is required for memory search.');
  const trajectories = await db.all('SELECT id, title, status, author_name, semantic_summary, diff_lines, created_at FROM trajectories ORDER BY created_at DESC');
  const decisions = await db.all('SELECT id, title, category, content, created_by, created_at FROM genome_decisions ORDER BY created_at DESC');
  const corpus = [
    ...trajectories.map((item) => {
      let diffLines = [];
      try { diffLines = JSON.parse(item.diff_lines || '[]'); } catch {}
      return {
        id: item.id,
        title: item.title,
        category: 'Trajectory',
        status: item.status === 'rejected' ? 'FAILURE' : 'SUCCESS',
        summary: item.semantic_summary || diffLines.map((line) => line.content || line.text || line).join(' '),
        tags: ['trajectory', item.status],
        author: item.author_name,
        createdAt: item.created_at
      };
    }),
    ...decisions.map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      status: 'SUCCESS',
      summary: item.content,
      tags: ['genome', item.category],
      author: item.created_by,
      createdAt: item.created_at
    }))
  ];

  // Score each memory item
  const scoredItems = corpus.map(item => {
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
  const turns = Array.isArray(rawTurns) ? rawTurns : [];

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
 * Builds a counterfactual branch description from a persisted trajectory.
 */
function counterfactualReplay(originalTrajectory = {}, stepIndex = 2, alterations = {}) {
  const turns = originalTrajectory.turns || originalTrajectory.diffLines || [];
  if (!Array.isArray(turns) || turns.length === 0) {
    throw new Error('A persisted trajectory with recorded steps is required for counterfactual replay.');
  }
  const step = Math.min(Math.max(1, Number(stepIndex) || 1), turns.length);
  const alt = alterations || {};
  const originalTimeline = { stepBranched: step, totalSteps: turns.length, steps: turns, sourceTrajectoryId: originalTrajectory.id };
  const counterfactualTimeline = {
    stepBranched: step,
    alterationApplied: alt,
    totalSteps: turns.length,
    steps: [...turns.slice(0, step), { type: 'Counterfactual Override', ...alt }, ...turns.slice(step)]
  };

  return {
    replayId: `what-if-${Date.now()}`,
    timestamp: new Date().toISOString(),
    branchingPoint: step,
    comparison: {
      mode: 'recorded-trajectory-branch',
      originalTimeline,
      counterfactualTimeline,
      outcome: 'Branch prepared from persisted steps; execution evidence is required before comparing results.'
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
