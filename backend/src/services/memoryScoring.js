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

const VECTOR_DIM = 768;

function hashTokenIntoVector(term, vec, dim, weight = 1.0) {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < term.length; i++) {
    h1 ^= term.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  const idx = Math.abs(h1) % dim;
  const sign = (h1 & 0x10000) ? 1 : -1;
  vec[idx] += sign * weight;
}

/**
 * Computes deterministic vector representation with 768 dimensions compatible with sqlite-vec
 * @param {string} text
 * @param {number} [dim=768]
 * @returns {number[]}
 */
function textToVector(text = '', dim = VECTOR_DIM) {
  const vec = new Float64Array(dim);
  const normalized = String(text || '').toLowerCase().trim();
  if (!normalized) return Array.from(vec);

  const tokens = normalized.split(/[\s,._\-\(\)]+/).filter(Boolean);
  if (tokens.length === 0) return Array.from(vec);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    hashTokenIntoVector(token, vec, dim, 1.0);
    if (i < tokens.length - 1) {
      hashTokenIntoVector(`${token}_${tokens[i + 1]}`, vec, dim, 1.5);
    }
  }

  // L2 normalize
  let sumSq = 0;
  for (let i = 0; i < dim; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      vec[i] = Number((vec[i] / norm).toFixed(6));
    }
  }
  return Array.from(vec);
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

function computeCredibilityMultiplier(item) {
  const authorLower = String(item?.author || '').toLowerCase();
  if (authorLower === 'memory_seed' || authorLower === 'system') return 1.2;
  if (authorLower === 'user' || authorLower === 'human') return 0.95;
  return 1.0;
}

function enrichSummaryWithSourceMarker(item) {
  const authorLower = String(item?.author || '').toLowerCase();
  const rawSummary = String(item?.summary || '');
  if ((authorLower === 'memory_seed' || authorLower === 'system') && rawSummary && !rawSummary.startsWith('[VERIFIED_SYSTEM_FACT]')) {
    return `[VERIFIED_SYSTEM_FACT] ${rawSummary}`;
  }
  if ((authorLower === 'user' || authorLower === 'human') && rawSummary && !rawSummary.startsWith('[Source: Utilisateur]')) {
    return `[Source: Utilisateur] ${rawSummary}`;
  }
  return rawSummary;
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
      const distance = Number(item.distance);
      cosScore = Number.isFinite(distance) ? Math.max(0, Math.min(1, 1.0 - (distance / 2.0))) : 0;
    } else {
      cosScore = Math.max(0, Math.min(1, rrfNorm));
    }
    hybridScore = Math.max(rrfNorm, tfidfScore);
  } else if (item.vector && item.vector.length && queryInfo.queryVec && queryInfo.queryVec.length === item.vector.length) {
    cosScore = cosineSimilarity(queryInfo.queryVec, item.vector);
    hybridScore = Math.max(cosScore, tfidfScore);
  }
  cosScore = Math.max(0, Math.min(1, Number(cosScore) || 0));

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

  const referenceTime = options.referenceTime == null ? Date.now() : new Date(options.referenceTime).getTime();
  const now = Number.isFinite(referenceTime) ? referenceTime : Date.now();
  const ageMs = now - new Date(item.createdAt || 0).getTime();
  // Continuous temporal recency & Ebbinghaus decay
  const tauMs = 7 * 24 * 3600 * 1000; // 7-day half-life decay
  const temporalDecay = Math.max(0.4, 0.4 + 0.6 * Math.exp(-Math.max(0, ageMs) / tauMs));
  const neurogenesisBonus = (item.createdAt && ageMs < 24 * 3600 * 1000 && ageMs >= 0) ? 1.15 : 1.0;
  const recencyFactor = item.createdAt ? (temporalDecay * neurogenesisBonus) : 1.0;

  // Sensitive synaptic weight scaling: attenuated connections yield significantly lower retrieval scores
  const normalizedWeight = Number.isFinite(weight) ? Math.max(0.0, weight) : 1.0;
  const weightFactor = 0.3 + 0.7 * Math.min(1.5, normalizedWeight);

  let finalScore = baseScore * weightFactor * credibility * recencyFactor;

  const hormone = options.hormone || 'normal';
  if (hormone === 'dopamine') {
    const dopamineSignal = Math.max(0, Math.min(1, Number(options.dopamineSignal || 0)));
    finalScore += dopamineSignal * 0.3;
  } else if (hormone === 'adrenaline') {
    if (cosScore < 0.75) finalScore = 0;
  }
  finalScore = Math.max(0, Math.min(1, finalScore));

  return {
    ...item,
    summary: enrichSummaryWithSourceMarker(item),
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
