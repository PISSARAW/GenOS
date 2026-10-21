'use strict';

const STOP_WORDS = ['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'est', 'sont', 'a', 'en', 'dans', 'pour', 'que', 'qui', 'sur', 'ce', 'se', 'il', 'elle', 'pas', 'ne', 'plus', 'par'];

function countFrequencies(words) {
  const freqs = {};
  for (const w of words) {
    if (w && w.length >= 2 && !STOP_WORDS.includes(w)) {
      freqs[w] = (freqs[w] || 0) + 1;
    }
  }
  return freqs;
}

function repetitionScore(freqs) {
  let total = 0;
  let maxCount = 0;
  for (const w in freqs) {
    total += freqs[w];
    if (freqs[w] > maxCount) maxCount = freqs[w];
  }
  return total > 0 ? maxCount / total : 0;
}

function topicScore(textLower, expectedTerms) {
  if (expectedTerms.length === 0) return 1.0;
  let expectedCount = 0;
  for (const t of expectedTerms) {
    if (textLower.includes(String(t).toLowerCase())) expectedCount += 1;
  }
  return expectedCount / expectedTerms.length;
}

function driftScore(textLower, forbiddenTerms) {
  if (forbiddenTerms.length === 0) return 0;
  let driftCount = 0;
  for (const t of forbiddenTerms) {
    if (textLower.includes(String(t).toLowerCase())) driftCount += 1;
  }
  return driftCount / forbiddenTerms.length;
}

function calculateScores(textLower, expectedTerms, forbiddenTerms) {
  const words = textLower.match(/\b[\w\u00e0-\u00ff-]+\b/g) || [];
  const freqs = countFrequencies(words);
  return {
    repetition: repetitionScore(freqs),
    topic: topicScore(textLower, expectedTerms || []),
    drift: driftScore(textLower, forbiddenTerms || []),
  };
}

function evaluateCognitiveHealth(text, expectedTerms, forbiddenTerms) {
  if (!text) {
    return { health_score: 1.0, repetition_score: 0, topic_alignment: 1.0, semantic_drift: 0 };
  }
  const scores = calculateScores(String(text).toLowerCase(), expectedTerms || [], forbiddenTerms || []);
  let health = 1.0;
  if (scores.repetition > 0.15) health -= 0.8;
  else if (scores.repetition > 0.10) health -= 0.4;
  if (scores.drift > 0) health -= 0.5;
  if (scores.topic < 0.5) health -= 0.2;
  return {
    health_score: Math.max(0, health),
    repetition_score: scores.repetition,
    topic_alignment: scores.topic,
    semantic_drift: scores.drift,
  };
}

module.exports = { evaluateCognitiveHealth, calculateScores };