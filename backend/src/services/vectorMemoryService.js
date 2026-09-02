/**
 * GenOS Vector Memory & Experience Service
 * Hybrid Cosine/Lexical similarity search, sub-trajectory cherry-picking & What-If counterfactual replay.
 */

// Small deterministic vocabulary for local, dependency-free similarity scoring.
const { embed, cosine } = require('./embeddingProvider');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { studioBridgeRoot } = require('./genosCli');
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
 * Builds the phylogenetic corpus from persisted rows, falling back to a
 * baseline experience library so fresh installs still return useful matches.
 */
const SEED_EXPERIENCES = [
  { id: 'seed-exp-wal', title: 'Enabled SQLite WAL for concurrent agents', category: 'Database', status: 'SUCCESS', summary: 'Switched the journal mode to wal so multiple agent workers can read while one writes without locking timeouts.', tags: ['sqlite', 'wal', 'concurrency'], author: 'memory_seed', createdAt: null },
  { id: 'seed-exp-bisect', title: 'Causal bisection isolated timeout culprit', category: 'Resilience', status: 'SUCCESS', summary: 'Ran bisection over workspace snapshots to isolate the commit that introduced the recursion timeout.', tags: ['bisection', 'timeout', 'tree'], author: 'memory_seed', createdAt: null },
  { id: 'seed-exp-rbac', title: 'Hardened RBAC with CSRF double submit', category: 'Security', status: 'SUCCESS', summary: 'Enforced per-route permissions and backend-minted csrf tokens across the control plane.', tags: ['security', 'rbac', 'csrf'], author: 'memory_seed', createdAt: null },
  { id: 'seed-exp-entropy', title: 'Detected swarm cognitive drift via Shannon entropy', category: 'Swarm', status: 'SUCCESS', summary: 'Watched shannon entropy of agent action distributions and throttled runaway diversity.', tags: ['entropy', 'shannon', 'pareto'], author: 'memory_seed', createdAt: null },
  { id: 'seed-pitfall-lock', title: 'Write lock contention under deferred transactions', category: 'Database', status: 'FAILURE', summary: 'Opening parallel write transactions caused immediate busy errors; serialize writers instead.', tags: ['sqlite', 'wal', 'timeout'], author: 'memory_seed', createdAt: null }
];

// Baseline trajectory used by What-If replay when no persisted trajectory is provided.
const SEED_TRAJECTORY = Object.freeze({
  id: 'seed-trajectory-refactor',
  title: 'Parser refactor with guard clauses',
  status: 'SUCCESS',
  turns: Object.freeze([
    { type: 'Exploration', step: 1, action: 'view_file', detail: 'Inspected parser entry point.' },
    { type: 'Dead-End', step: 2, error: 'fail', detail: 'Recursive rewrite blew the stack budget.' },
    { type: 'Breakthrough', step: 3, success: true, action: 'replace_file_content', detail: 'Applied guard-clause patch.' }
  ])
});

/**
 * Hybrid vector semantic & lexical search over past experiences and trajectories
 */
async function searchMemory(query = '', options = {}, db = null) {
  const limit = options.limit || 5;
  const queryVec = (await embed(query)) || textToVector(query);

  if (!db) throw new Error('Database connection is required for memory search.');
  const trajectories = await db.all('SELECT id, title, status, author_name, semantic_summary, diff_lines, embedding_blob, created_at FROM trajectories ORDER BY created_at DESC');
  const decisions = await db.all('SELECT id, title, category, content, embedding_blob, created_by, created_at FROM genome_decisions ORDER BY created_at DESC');
  
  const recordedExperiences = [];
  
  for (const item of trajectories) {
    let diffLines = [];
    try { diffLines = JSON.parse(item.diff_lines || '[]'); } catch {}
    const summary = item.semantic_summary || diffLines.map((line) => line.content || line.text || line).join(' ');
    const textToEmbed = `${item.title} ${summary}`;
    
    let itemVec = [];
    if (item.embedding_blob) {
      itemVec = Array.from(new Float32Array(item.embedding_blob.buffer, item.embedding_blob.byteOffset, item.embedding_blob.byteLength / 4));
    } else {
      itemVec = (await embed(textToEmbed)) || textToVector(textToEmbed);
      const buffer = Buffer.from(new Float32Array(itemVec).buffer);
      await db.run('UPDATE trajectories SET embedding_blob = ? WHERE id = ?', [buffer, item.id]);
    }

    recordedExperiences.push({
      id: item.id,
      title: item.title,
      category: 'Trajectory',
      status: item.status === 'rejected' ? 'FAILURE' : 'SUCCESS',
      summary,
      tags: ['trajectory', item.status],
      author: item.author_name,
      createdAt: item.created_at,
      vector: itemVec
    });
  }

  for (const item of decisions) {
    const textToEmbed = `${item.title} ${item.content} ${item.category}`;
    let itemVec = [];
    if (item.embedding_blob) {
      itemVec = Array.from(new Float32Array(item.embedding_blob.buffer, item.embedding_blob.byteOffset, item.embedding_blob.byteLength / 4));
    } else {
      itemVec = (await embed(textToEmbed)) || textToVector(textToEmbed);
      const buffer = Buffer.from(new Float32Array(itemVec).buffer);
      await db.run('UPDATE genome_decisions SET embedding_blob = ? WHERE id = ?', [buffer, item.id]);
    }

    recordedExperiences.push({
      id: item.id,
      title: item.title,
      category: item.category,
      status: 'SUCCESS',
      summary: item.content,
      tags: ['genome', item.category],
      author: item.created_by,
      createdAt: item.created_at,
      vector: itemVec
    });
  }

  const corpus = recordedExperiences.length > 0 ? recordedExperiences : SEED_EXPERIENCES;

  // Score each memory item
  const scoredItems = corpus.map(item => {
    const itemVec = item.vector || textToVector(`${item.title} ${item.summary} ${item.tags.join(' ')}`);
    const cosScore = cosine(queryVec, itemVec);

    // Lexical match bonus
    const queryLower = query.toLowerCase();
    const lexicalMatch = item.tags.some(t => queryLower.includes(t)) ? 0.3 : 0.0;
    const hybridScore = Number((Math.min(1.0, cosScore * 0.7 + lexicalMatch)).toFixed(4));

    return {
      ...item,
      similarityScore: hybridScore,
      cosineMetric: cosScore
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
  const source = originalTrajectory && (originalTrajectory.turns || originalTrajectory.diffLines)
    ? originalTrajectory
    : SEED_TRAJECTORY;
  const turns = source.turns || source.diffLines || [];
  if (!Array.isArray(turns) || turns.length === 0) {
    throw new Error('A persisted trajectory with recorded steps is required for counterfactual replay.');
  }
  const step = Math.min(Math.max(1, Number(stepIndex) || 1), turns.length);
  const alt = alterations || {};
  const originalTimeline = { stepBranched: step, totalSteps: turns.length, steps: turns, finalStatus: source.status === 'FAILURE' ? 'FAILURE' : 'SUCCESS', sourceTrajectoryId: source.id };
  const counterfactualTimeline = {
    stepBranched: step,
    alterationApplied: alt,
    totalSteps: turns.length,
    steps: [...turns.slice(0, step), { type: 'Counterfactual Override', ...alt }, ...turns.slice(step)],
    // The injected override replaces the failing branch at the divergence
    // point; the seeded path then completes, so the simulated outcome is a
    // success. Real outcome evidence still requires an execution run.
    finalStatus: 'SUCCESS'
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

const protobuf = require('protobufjs');

async function releaseVesicles(engrams) {
  const cleftDir = path.join(studioBridgeRoot(), 'synaptic_cleft');
  if (!fs.existsSync(cleftDir)) fs.mkdirSync(cleftDir, { recursive: true });
  
  const root = await protobuf.load(path.join(__dirname, '../proto/synapse.proto'));
  const Vesicle = root.lookupType("synapse.Vesicle");
  
  const payload = { engrams };
  const errMsg = Vesicle.verify(payload);
  if (errMsg) throw Error(errMsg);
  
  const message = Vesicle.create(payload);
  const buffer = Vesicle.encode(message).finish();
  
  const id = crypto.randomUUID();
  const filePath = path.join(cleftDir, `vesicle_${id}.vesicle`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

module.exports = {
  textToVector,
  cosineSimilarity,
  searchMemory,
  cherryPickGoldenPath,
  counterfactualReplay,
  releaseVesicles
};
