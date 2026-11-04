'use strict';
const { digest, fail } = require('./qualityContract');
const { isHeading, wordCount } = require('./qualityText');
const LIMITS = Object.freeze({ minimumWords: 8, minimumCharacters: 40,
  minimumOccurrences: 4, peakOccurrences: 6, repeatedWords: 120, repeatedFraction: 0.45, duplicateWords: 80 });

function normalize(value) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}'’]+/gu, ' ').trim();
}
function cue(value) { return /^[\p{Lu}][\p{Lu} .’'-]{1,40}(?:\s*\([^\n]+\))?:?$/u.test(value); }
function passages(text) {
  const result = [];
  for (const match of text.matchAll(/[^\r\n.!?]+(?:[.!?]+|(?=\r?\n|$))/gu)) {
    const quote = match[0].trim();
    if (!quote || isHeading(quote) || cue(quote)) continue;
    const normalized = normalize(quote), words = wordCount(normalized);
    result.push({ quote, normalized, words, start: match.index + match[0].indexOf(quote) });
  }
  return result;
}
function substantial(passage) {
  return passage.words >= LIMITS.minimumWords && passage.normalized.length >= LIMITS.minimumCharacters;
}
function groupsOf(items) {
  const groups = new Map();
  for (const item of items.filter(substantial)) {
    if (!groups.has(item.normalized)) groups.set(item.normalized, []);
    groups.get(item.normalized).push(item);
  }
  return [...groups.values()].filter(items => items.length >= LIMITS.minimumOccurrences);
}
function evidence(passage) {
  return { start: passage.start, end: passage.start + passage.quote.length, quote: passage.quote };
}
function loopInspection(items) {
  const groups = groupsOf(items);
  const bodyWords = items.reduce((sum, item) => sum + item.words, 0);
  const repeatedWords = groups.reduce((sum, group) => sum + (group.length - 1) * group[0].words, 0);
  const peakOccurrences = Math.max(0, ...groups.map(group => group.length));
  const repeatedFraction = bodyWords ? repeatedWords / bodyWords : 0;
  const detected = repeatedWords >= LIMITS.repeatedWords && repeatedFraction >= LIMITS.repeatedFraction
    && peakOccurrences >= LIMITS.peakOccurrences;
  const ranked = groups.sort((a, b) => b.length * b[0].words - a.length * a[0].words);
  return { detected, metrics: { bodyWords, repeatedWords, repeatedFraction, peakOccurrences },
    evidence: ranked.slice(0, 3).flatMap(group => group.slice(0, 2).map(evidence)) };
}
function bodyKey(text) {
  return normalize(text.split(/\r?\n/).filter(line => !isHeading(line)).join('\n'));
}
function duplicateScene(text, context) {
  const substantiveWords = context.items.reduce((sum, item) => sum + item.words, 0);
  if (substantiveWords < LIMITS.duplicateWords) return null;
  const key = bodyKey(text);
  for (const prior of context.previousScenes) {
    if (typeof prior?.text !== 'string') throw fail('GQEL_SCENE_CONTEXT_INVALID', 'Previous scene text required.');
    if (bodyKey(prior.text) === key) return { id: prior.id, digest: digest(prior.text), bodyDigest: digest(key), bodyWords: substantiveWords };
  }
  return null;
}
function diagnostic(code, context, proof) {
  return { code, severity: 'major', stage: 'scene', section: context.sceneId,
    message: code === 'SCENE_BODY_DUPLICATED'
      ? `Le corps normalisé reprend celui de la scène ${proof.duplicate.id}. Écris son changement de situation propre.`
      : 'Des passages substantiels se répètent et dominent la scène. Écris des actions et décisions nouvelles plutôt que cette boucle.',
    evidence: proof.evidence, metrics: proof.metrics };
}
function inspectSceneRepetition(text, options = {}) {
  if (typeof text !== 'string') throw fail('GQEL_SCENE_INVALID', 'Scene text required.');
  const previousScenes = options.previousScenes ?? [];
  if (!Array.isArray(previousScenes)) throw fail('GQEL_SCENE_CONTEXT_INVALID', 'Previous scenes must be an array.');
  const items = passages(text), context = { items, previousScenes, sceneId: options.sceneId || 'scene' };
  const loop = loopInspection(items), duplicate = duplicateScene(text, context), defects = [];
  if (loop.detected) defects.push(diagnostic('SCENE_REPETITION_LOOP', context, loop));
  if (duplicate) defects.push(diagnostic('SCENE_BODY_DUPLICATED', context, { duplicate,
    evidence: items.slice(0, 2).map(evidence), metrics: { previousSceneId: duplicate.id,
      previousSceneDigest: duplicate.digest, normalizedBodyDigest: duplicate.bodyDigest, bodyWords: duplicate.bodyWords } }));
  return { passed: defects.length === 0, defects,
    metrics: { ...loop.metrics, artifactDigest: digest(text), duplicateOf: duplicate?.id || null },
    limits: LIMITS, boundaries: { semanticQualityCertified: false, acceptedForDelivery: false } };
}
function assertSceneNovelty(text, options = {}) {
  const result = inspectSceneRepetition(text, options);
  if (!result.passed) throw Object.assign(fail('GQEL_SCENE_REPETITIVE', 'Scene repetition requires a fresh authored attempt.'),
    { repairable: true, defects: result.defects, repetition: result.metrics });
  return text;
}

module.exports = { inspectSceneRepetition, assertSceneNovelty };
