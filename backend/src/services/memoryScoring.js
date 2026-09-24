const VOCABULARY = [
  'sqlite', 'wal', 'concurrency', 'ast', 'parser', 'recursion',
  'timeout', 'circuit', 'breaker', 'mcp', 'security', 'rbac',
  'csrf', 'xss', 'entropy', 'shannon', 'apoptosis', 'cryo',
  'bisection', 'crossover', 'mutation', 'tree', 'pareto', 'elo'
];

const VECTOR_DIM = 768;

function hashTokenIntoVector(term, vec, options = {}) {
  const { dim, weight = 1.0 } = options;
  let h1 = 0x811c9dc5;
  for (let i = 0; i < term.length; i++) {
    h1 ^= term.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  const idx = Math.abs(h1) % dim;
  const sign = (h1 & 0x10000) ? 1 : -1;
  vec[idx] += sign * weight;
}

function textToVector(text = '', dim = VECTOR_DIM) {
  const vec = new Float64Array(dim);
  const normalized = String(text || '').toLowerCase().trim();
  if (!normalized) return Array.from(vec);

  const tokens = normalized.split(/[\s,._\-\(\)]+/).filter(Boolean);
  if (tokens.length === 0) return Array.from(vec);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    hashTokenIntoVector(token, vec, { dim, weight: 1.0 });
    if (i < tokens.length - 1) {
      hashTokenIntoVector(`${token}_${tokens[i + 1]}`, vec, { dim, weight: 1.5 });
    }
  }

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

function cosineSimilarity(vecA = [], vecB = []) {
  if (!vecA.length || !vecB.length) return 0;
  // Refuse les comparaisons inter-dimensions : tronquer masquerait une
  // incompatibilité d'embedding (faux positifs silencieux).
  if (vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  const len = vecA.length;
  for (let i = 0; i < len; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return Number((dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))).toFixed(4));
}

// Seuils documentés (cf. scoreCorpusItem / evaluateMetacognition) :
// - boost crédibilité x1.2 : réservé aux faits système signés (voir ci-dessous).
// - nouveauté : top cosine < 0.50.
// - inhibition GABA : top1 < 0.45 ET (top1 - top3) < 0.005 (plateau ambigu, n >= 3).
// - adrénaline : annule le score si cosScore < 0.75 (rappel de survie strict).
// - neurogenèse : bonus x1.15 si créé il y a < 24h ; déclin temporel tau 7j, plancher 0.4.
function isAuthenticSystemFact(item) {
  if (!item) return false;
  // Signature interne exigée : un préfixe d'id ("seed-*", "exp-001") ou un
  // auteur/category auto-déclaré est spoofable par n'importe quel écrivain
  // de genome_decisions, donc ne confère plus aucun boost.
  if (item.verified === true || item.is_verified === 1) return true;
  if (item.internalSignature === true || item.systemSigned === true) return true;
  return false;
}

function itemAuthor(item) {
  const source = item || {};
  return String(source.author || '').toLowerCase();
}

function itemSummary(item) {
  const source = item || {};
  return source.summary || '';
}

function isUserAuthor(authorLower) {
  return authorLower === 'user' || authorLower === 'human';
}

function computeCredibilityMultiplier(item) {
  const authorLower = itemAuthor(item);
  if (isAuthenticSystemFact(item)) return 1.2;
  if (isUserAuthor(authorLower)) return 0.95;
  return 1.0;
}

function enrichSummaryWithSourceMarker(item) {
  const authorLower = itemAuthor(item);
  const rawSummary = String(itemSummary(item));
  if (isAuthenticSystemFact(item) && rawSummary && !rawSummary.startsWith('[VERIFIED_SYSTEM_FACT]')) {
    return `[VERIFIED_SYSTEM_FACT] ${rawSummary}`;
  }
  if (isUserAuthor(authorLower) && rawSummary && !rawSummary.startsWith('[Source: Utilisateur]')) {
    return `[Source: Utilisateur] ${rawSummary}`;
  }
  return rawSummary;
}

function buildItemText(item) {
  return `${item.title || ''} ${item.summary || ''} ${(item.tags || []).join(' ')}`;
}

function computeLexicalScores(item, queryInfo) {
  const query = queryInfo.query || '';
  const queryLower = query.toLowerCase();
  const queryTfidf = textToVector(query);
  const itemTfidf = textToVector(buildItemText(item));
  return { queryLower, tfidfScore: cosineSimilarity(queryTfidf, itemTfidf) };
}

function hasNumeric(value) {
  return value !== undefined && value !== null;
}

function hasRrfScore(item) {
  return hasNumeric(item.rrf_score);
}

function hasVectorMatch(item, queryInfo) {
  return Boolean(item.vector && item.vector.length && queryInfo.queryVec && queryInfo.queryVec.length === item.vector.length);
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, value));
}

function distanceCosine(value) {
  const distance = Number(value);
  if (!Number.isFinite(distance)) return 0;
  return 1.0 - (distance / 2.0);
}

function resolveRrfScores(item, tfidfScore) {
  const rrfNorm = item.rrf_score * 30.0;
  const cosScore = hasNumeric(item.distance) ? distanceCosine(item.distance) : rrfNorm;
  return { hybridScore: Math.max(rrfNorm, tfidfScore), cosScore };
}

function resolveVectorScores(item, queryInfo, tfidfScore) {
  const cosScore = cosineSimilarity(queryInfo.queryVec, item.vector);
  return { hybridScore: Math.max(cosScore, tfidfScore), cosScore };
}

function resolveSimilarity(item, queryInfo, tfidfScore) {
  if (hasRrfScore(item)) {
    return resolveRrfScores(item, tfidfScore);
  }
  if (hasVectorMatch(item, queryInfo)) {
    return resolveVectorScores(item, queryInfo, tfidfScore);
  }
  return { hybridScore: tfidfScore, cosScore: tfidfScore };
}

function termMatchWeight(term, item, tags) {
  if (tags.some(t => String(t).toLowerCase().includes(term))) return 1;
  if (String(item.title || '').toLowerCase().includes(term)) return 0.8;
  if (String(item.summary || '').toLowerCase().includes(term)) return 0.4;
  return 0;
}

function computeTermBonus(item, queryLower, tags) {
  const queryTerms = queryLower.split(/\s+/).filter(w => w.length > 2);
  let termMatchCount = 0;
  for (const term of queryTerms) {
    termMatchCount += termMatchWeight(term, item, tags);
  }
  return queryTerms.length > 0 ? (termMatchCount / queryTerms.length) * 0.4 : 0.0;
}

function computeBaseScore(item, hybridScore, queryLower) {
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const termBonus = computeTermBonus(item, queryLower, tags);
  const survivalBonus = item.status === 'SUCCESS' ? 0.15 : 0.0;
  return Number((hybridScore + termBonus + survivalBonus).toFixed(4));
}

function computeRecencyFactor(item, options) {
  const referenceTime = options.referenceTime == null ? Date.now() : new Date(options.referenceTime).getTime();
  const now = Number.isFinite(referenceTime) ? referenceTime : Date.now();
  const ageMs = now - new Date(item.createdAt || 0).getTime();
  const tauMs = 7 * 24 * 3600 * 1000;
  const temporalDecay = Math.max(0.4, 0.4 + 0.6 * Math.exp(-Math.max(0, ageMs) / tauMs));
  const neurogenesisBonus = (item.createdAt && ageMs < 24 * 3600 * 1000 && ageMs >= 0) ? 1.15 : 1.0;
  return (item.createdAt && !isAuthenticSystemFact(item)) ? (temporalDecay * neurogenesisBonus) : 1.0;
}

function readSynapticWeight(item) {
  return item.synaptic_weight !== undefined ? Number(item.synaptic_weight) : 1.0;
}

function computeWeightFactor(weight) {
  // Poids signés : un poids synaptique négatif (inhibition GABAergique)
  // doit dégrader le score, pas être clampé à 0 comme une absence de poids.
  const raw = Number.isFinite(weight) ? Number(weight) : 1.0;
  const clamped = Math.max(-1.5, Math.min(1.5, raw));
  return 0.3 + 0.7 * clamped;
}

function applyNeuromodulation(score, options, cosScore) {
  const hormone = options.hormone || 'normal';
  let finalScore = score;
  if (hormone === 'dopamine') {
    const dopamineSignal = clampUnit(Number(options.dopamineSignal || 0));
    finalScore += dopamineSignal * 0.3;
  } else if (hormone === 'adrenaline') {
    if (cosScore < 0.75) finalScore = 0;
  }
  return clampUnit(finalScore);
}

function scoreCorpusItem(item, queryInfo = {}, options = {}) {
  const { queryLower, tfidfScore } = computeLexicalScores(item, queryInfo);
  const similarity = resolveSimilarity(item, queryInfo, tfidfScore);
  const cosScore = clampUnit(Number(similarity.cosScore) || 0);
  const baseScore = computeBaseScore(item, similarity.hybridScore, queryLower);
  const credibility = computeCredibilityMultiplier(item);
  const recencyFactor = computeRecencyFactor(item, options);
  const weight = readSynapticWeight(item);
  const weightFactor = computeWeightFactor(weight);
  const finalScore = applyNeuromodulation(baseScore * weightFactor * credibility * recencyFactor, options, cosScore);

  return {
    ...item,
    summary: enrichSummaryWithSourceMarker(item),
    similarityScore: Number(finalScore.toFixed(4)),
    cosineMetric: cosScore,
    weight
  };
}

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
