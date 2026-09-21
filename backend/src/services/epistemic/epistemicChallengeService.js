'use strict';

/**
 * Challenge immunitaire épistémique.
 *
 * Génère des pathogènes épistémiques (fake evidence, self-verification,
 * unanimous false consensus, stale knowledge, verifier gaming, etc.)
 * pour mesurer la capacité du système à reconnaître, neutraliser, et
 * mémoriser les formes de conviction trompeuses.
 */

const PHOGENS = Object.freeze([
  'P01_FAKE_EVIDENCE',
  'P02_IRRELEVANT_EVIDENCE',
  'P03_UNANIMOUS_FALSE_CONSENSUS',
  'P04_STALE_KNOWLEDGE',
  'P05_VERIFIER_GAMING',
  'P06_SELF_VERIFICATION',
  'P07_HIDDEN_ASSUMPTION',
  'P08_FALSE_CITATION',
  'P09_INCOMPLETE_PASSING_TEST',
  'P10_CORRELATED_MODEL_FAILURE',
]);

function pathogenId() {
  return `path-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function createPathogen(type, opts = {}) {
  return {
    id: opts.id || pathogenId(),
    type,
    domain: opts.domain || 'general',
    description: opts.description || type,
    epitopes: opts.epitopes || {},
    dangerLevel: opts.dangerLevel || 0.5,
    createdAt: new Date().toISOString(),
  };
}

function challengeReport(pathogens = [], results = []) {
  const total = pathogens.length;
  const recognized = results.filter((r) => r.recognized).length;
  const neutralized = results.filter((r) => r.neutralized).length;
  const falsePositives = results.filter((r) => r.falsePositive).length;
  const immuneEscapes = results.filter((r) => r.immuneEscape).length;
  const memoryHits = results.filter((r) => r.memoryHit).length;
  return {
    total,
    recognized,
    neutralized,
    falsePositives,
    immuneEscapes,
    memoryHits,
    recognitionRate: total > 0 ? recognized / total : 0,
    neutralizationRate: total > 0 ? neutralized / total : 0,
    falsePositiveRate: total > 0 ? falsePositives / total : 0,
    immuneEscapeRate: total > 0 ? immuneEscapes / total : 0,
    memoryResponseGain: memoryHits > 0 ? memoryHits / total : 0,
    autoImmuneRate: results.filter((r) => r.autoImmune).length / Math.max(1, total),
  };
}

function challengeMetrics(report) {
  return {
    far: report.falsePositiveRate,
    recognitionRate: report.recognitionRate,
    neutralizationRate: report.neutralizationRate,
    immuneEscapeRate: report.immuneEscapeRate,
    memoryResponseGain: report.memoryResponseGain,
    autoImmuneRate: report.autoImmuneRate,
    responseCost: report.total * 1.5,
    responseLatency: report.total * 1200,
  };
}

function buildChallengeSuite(opts = {}) {
  const suite = PHOGENS.map((type) => createPathogen(type, {
    domain: opts.domain || 'general',
    dangerLevel: opts.dangerLevel || 0.5,
  }));
  return {
    suite,
    count: suite.length,
    type: 'epistemic_pathogen_challenge',
  };
}

function runChallenge(pathogens = [], immuneSystem = null) {
  return pathogens.map((pathogen) => {
    const recognized = immuneSystem ? immuneSystem.recognize(pathogen) : false;
    const neutralized = immuneSystem ? immuneSystem.neutralize(pathogen) : false;
    const memoryHit = immuneSystem ? immuneSystem.hasMemory(pathogen) : false;
    return {
      pathogen: pathogen.id,
      type: pathogen.type,
      recognized,
      neutralized,
      memoryHit,
      falsePositive: !recognized && neutralized,
      immuneEscape: recognized && !neutralized,
      autoImmune: false,
    };
  });
}

module.exports = {
  PHOGENS,
  pathogenId,
  createPathogen,
  challengeReport,
  challengeMetrics,
  buildChallengeSuite,
  runChallenge,
};
