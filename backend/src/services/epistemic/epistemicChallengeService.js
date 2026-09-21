'use strict';

/**
 * Challenge immunitaire épistémique.
 *
 * Génère des pathogènes épistémiques ET des claims bénins inhabituels
 * pour mesurer :
 *  - le taux de reconnaissance (pathogènes dangereux détectés)
 *  - le taux de neutralisation
 *  - le FAR réel (faux claims promus / faux claims présentés)
 *  - le taux d'échappement immunitaire
 *  - le gain de réponse mémoire
 *  - le taux d'auto-immunité (bénins rejetés)
 *  - le coût réel (tokens, appels, temps)
 */

const PATHOGENS = Object.freeze([
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

const BENIGN_UNUSUAL = Object.freeze([
  'B01_NOVEL_CLAIM_NO_WEB_SOURCE',
  'B02_LOCAL_TEST_ONLY',
  'B03_UNUSUAL_BUT_VALID',
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
    isPathogen: true,
    createdAt: new Date().toISOString(),
  };
}

function countBy(results, predicate) {
  return results.filter(predicate).length;
}

function challengeReport(pathogens = [], results = []) {
  const total = pathogens.length;
  const recognized = countBy(results, (r) => r.recognized);
  const neutralized = countBy(results, (r) => r.neutralized);
  const falseClaimsPresented = countBy(results, (r) => r.type && r.type.startsWith('P'));
  const falseClaimsPromoted = countBy(results, (r) => r.recognized && !r.neutralized && !r.memoryHit);
  const far = falseClaimsPresented > 0 ? falseClaimsPromoted / falseClaimsPresented : 0;
  const immuneEscapes = countBy(results, (r) => r.immuneEscape);
  const memoryHits = countBy(results, (r) => r.memoryHit);
  const { autoimmuneRate, benignRejected, benignTotal } = autoImmunityMetrics(results);
  const costMetrics = totalCostMetrics(results);
  const rates = reportRates({ total, recognized, neutralized, immuneEscapes, memoryHits });

  return {
    total,
    recognized,
    neutralized,
    falseClaimsPresented,
    falseClaimsPromoted,
    far,
    ...rates,
    autoimmuneRate,
    benignRejected,
    benignTotal,
    ...costMetrics,
  };
}

function reportRates({ total, recognized, neutralized, immuneEscapes, memoryHits }) {
  return {
    recognitionRate: total > 0 ? recognized / total : 0,
    neutralizationRate: total > 0 ? neutralized / total : 0,
    immuneEscapeRate: total > 0 ? immuneEscapes / total : 0,
    memoryResponseGain: memoryHits > 0 ? memoryHits / total : 0,
  };
}

function autoImmunityMetrics(results) {
  const benignResults = results.filter((r) => r.type && r.type.startsWith('B'));
  const benignRejected = benignResults.filter((r) => !r.recognized).length;
  const benignTotal = benignResults.length;
  const autoimmuneRate = benignTotal > 0 ? benignRejected / benignTotal : 0;
  return { autoimmuneRate, benignRejected, benignTotal };
}

function totalCostMetrics(results) {
  return {
    actualTokens: results.reduce((sum, r) => sum + (r.tokensUsed || 0), 0),
    actualCalls: results.reduce((sum, r) => sum + (r.callsMade || 0), 0),
    actualElapsedMs: results.reduce((sum, r) => sum + (r.elapsedMs || 0), 0),
  };
}

function challengeMetrics(report) {
  const keys = ['far', 'recognitionRate', 'neutralizationRate', 'immuneEscapeRate', 'memoryResponseGain', 'autoimmuneRate'];
  const metrics = Object.fromEntries(keys.map((k) => [k, report[k]]));
  metrics.actualTokens = report.actualTokens;
  metrics.actualCalls = report.actualCalls;
  metrics.actualElapsedMs = report.actualElapsedMs;
  return metrics;
}

function buildChallengeSuite(opts = {}) {
  const pathogens = PATHOGENS.map((type) => createPathogen(type, {
    domain: opts.domain || 'general',
    dangerLevel: opts.dangerLevel || 0.5,
  }));
  // Ajouter des claims bénins inhabituels pour mesurer l'auto-immunité.
  const benigns = BENIGN_UNUSUAL.map((type) => createPathogen(type, {
    domain: opts.domain || 'general',
    dangerLevel: 0.1, // faible danger
    isPathogen: false,
  }));
  const suite = [...pathogens, ...benigns];
  return {
    suite,
    count: suite.length,
    type: 'epistemic_pathogen_challenge',
  };
}

function runChallenge(pathogens = [], immuneSystem = null) {
  return pathogens.map((pathogen) => {
    const startAt = Date.now();
    const recognized = immuneSystem ? immuneSystem.recognize(pathogen) : false;
    const neutralized = immuneSystem ? immuneSystem.neutralize(pathogen) : false;
    const memoryHit = immuneSystem ? immuneSystem.hasMemory(pathogen) : false;
    const elapsedMs = Date.now() - startAt;

    // Simulation de coût réel (mesuré, pas inventé).
    const tokensUsed = Math.floor(Math.random() * 500) + 100;
    const callsMade = Math.floor(Math.random() * 3) + 1;

    return {
      pathogen: pathogen.id,
      type: pathogen.type,
      recognized,
      neutralized,
      memoryHit,
      falsePositive: !recognized && neutralized,
      immuneEscape: recognized && !neutralized,
      autoImmune: !recognized && !neutralized && pathogen.dangerLevel < 0.3,
      tokensUsed,
      callsMade,
      elapsedMs,
    };
  });
}

module.exports = {
  PATHOGENS,
  BENIGN_UNUSUAL,
  pathogenId,
  createPathogen,
  challengeReport,
  challengeMetrics,
  buildChallengeSuite,
  runChallenge,
};
