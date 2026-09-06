/**
 * GenOS Cognitive Memory - Scoring & Metacognition Service
 * TF-IDF Lexical, Cosine Similarity, Epistemic Vigilance, and Neuromodulation
 */

const VOCABULARY = [
  'sqlite', 'wal', 'concurrency', 'ast', 'parser', 'recursion',
  'timeout', 'circuit', 'breaker', 'mcp', 'security', 'rbac',
  'csrf', 'xss', 'entropy', 'shannon', 'apoptosis', 'cryo',
  'bisection', 'crossover', 'mutation', 'tree', 'pareto', 'elo'
];

/**
 * Computes deterministic vector representation over vocabulary
 * @param {string} text
 * @returns {number[]}
 */
function textToVector(text = '') {
  const words = String(text || '').toLowerCase().split(/[\s,._\-\(\)]+/);
  const counts = {};
  for (const w of words) {
    if (w) counts[w] = (counts[w] || 0) + 1;
  }

  const vec = VOCABULARY.map(term => counts[term] || 0);
  let hashVal = 0;
  for (let i = 0; i < (text || '').length; i++) {
    hashVal = (hashVal + text.charCodeAt(i)) % 10;
  }
  vec.push(hashVal / 10);
  return vec;
}

/**
 * Computes cosine similarity between two numeric vectors
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number}
 */
function cosineSimilarity(vecA = [], vecB = []) {
  if (!vecA.length || !vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  const len = Math.min(vecA.length, vecB.length);
  for (let i = 0; i < len; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return Number((dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))).toFixed(4));
}

/**
 * Evaluates epistemic vigilance multiplier and applies source markers
 * @param {object} item
 * @returns {number}
 */
function computeCredibilityMultiplier(item) {
  const authorLower = String(item.author || '').toLowerCase();
  let multiplier = 1.0;

  if (authorLower === 'memory_seed' || authorLower === 'system') {
    multiplier = 1.2;
    if (item.summary && !item.summary.startsWith('[VERIFIED_SYSTEM_FACT]')) {
      item.summary = `[VERIFIED_SYSTEM_FACT] ${item.summary}`;
    }
  } else if (authorLower === 'user' || authorLower === 'human') {
    multiplier = 0.95;
    if (item.summary && !item.summary.startsWith('[Source: Utilisateur]')) {
      item.summary = `[Source: Utilisateur] ${item.summary}`;
    }
  }
  return multiplier;
}

/**
 * Scores an individual corpus memory item against a query
 * @param {object} item
 * @param {object} queryInfo
 * @param {object} options
 * @returns {object}
 */
function scoreCorpusItem(item, queryInfo = {}, options = {}) {
  const query = queryInfo.query || '';
  const queryLower = query.toLowerCase();

  // Always compute deterministic lexical TF-IDF cosine similarity as baseline
  const queryTfidf = textToVector(query);
  const itemText = `${item.title || ''} ${item.summary || ''} ${(item.tags || []).join(' ')}`;
  const itemTfidf = textToVector(itemText);
  const tfidfScore = cosineSimilarity(queryTfidf, itemTfidf);

  let hybridScore = tfidfScore;
  let cosScore = tfidfScore;

  if (item.rrf_score !== undefined && item.rrf_score !== null) {
    const rrfNorm = item.rrf_score * 30.0;
    if (item.distance !== undefined && item.distance !== null) {
      cosScore = 1.0 - ((item.distance * item.distance) / 2.0);
    } else {
      cosScore = rrfNorm;
    }
    hybridScore = Math.max(rrfNorm, tfidfScore);
  } else if (item.vector && item.vector.length && queryInfo.queryVec && queryInfo.queryVec.length === item.vector.length) {
    cosScore = cosineSimilarity(queryInfo.queryVec, item.vector);
    hybridScore = Math.max(cosScore, tfidfScore);
  }

  const tags = Array.isArray(item.tags) ? item.tags : [];
  const queryTerms = queryLower.split(/\s+/).filter(w => w.length > 2);
  let termMatchCount = 0;
  for (const term of queryTerms) {
    if (tags.some(t => String(t).toLowerCase().includes(term))) termMatchCount++;
    else if ((item.title || '').toLowerCase().includes(term)) termMatchCount += 0.8;
    else if ((item.summary || '').toLowerCase().includes(term)) termMatchCount += 0.4;
  }
  const termBonus = queryTerms.length > 0 ? (termMatchCount / queryTerms.length) * 0.4 : 0.0;
  const survivalBonus = item.status === 'SUCCESS' ? 0.15 : 0.0;
  const weight = item.synaptic_weight !== undefined ? Number(item.synaptic_weight) : 1.0;

  const baseScore = Number((hybridScore + termBonus + survivalBonus).toFixed(4));
  const credibility = computeCredibilityMultiplier(item);

  const ageMs = Date.now() - new Date(item.createdAt || 0).getTime();
  const neurogenesisBonus = (item.createdAt && ageMs < 24 * 3600 * 1000) ? 1.5 : 1.0;

  let finalScore = baseScore * (0.8 + 0.2 * weight) * credibility * neurogenesisBonus;

  const hormone = options.hormone || 'normal';
  if (hormone === 'dopamine') {
    const dopamineSignal = Math.max(0, Math.min(1, Number(options.dopamineSignal || 0)));
    finalScore += dopamineSignal * 0.3;
  } else if (hormone === 'adrenaline') {
    if (cosScore < 0.75) finalScore = 0;
  }

  return {
    ...item,
    similarityScore: Number(finalScore.toFixed(4)),
    cosineMetric: cosScore,
    weight
  };
}

/**
 * Biologically-inspired metacognition (Dentate Gyrus novelty & GABA inhibition)
 * @param {Array} scoredItems
 * @returns {object}
 */
function evaluateMetacognition(scoredItems = []) {
  let gabaInhibited = false;
  let noveltyDetected = false;

  if (scoredItems.length > 0) {
    const topCosine = scoredItems[0].cosineMetric || 0;
    if (topCosine < 0.50) {
      noveltyDetected = true;
    }

    if (scoredItems.length >= 3) {
      const top1 = scoredItems[0].cosineMetric || 0;
      const top3 = scoredItems[2].cosineMetric || 0;
      if (top1 < 0.45 && (top1 - top3) < 0.005) {
        gabaInhibited = true;
      }
    }
  }

  return { gabaInhibited, noveltyDetected };
}

module.exports = {
  VOCABULARY,
  textToVector,
  cosineSimilarity,
  scoreCorpusItem,
  evaluateMetacognition
};
