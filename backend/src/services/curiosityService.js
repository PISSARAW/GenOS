//! Curiosity calculus with learning-progress intrinsic motivation.
//!
//! Replaces naive "unobserved = curious" with the human-backed finding that
//! people allocate exploration time following expected learning progress
//! (Ten et al., 2021, PMC8514490): competence is used to avoid already-easy
//! activities while learning-progress signals select learnable, improvable ones.
//!
//! Rewards combine:
//!   - novelty N(x)                  : never / rarely seen
//!   - expected information gain IG(x)
//!   - learning progress LP(x)       : improvement in prediction / mastery
//!   - affordance uncertainty A(x)   : affordances not yet characterised
//!   - cost penalty  Cost(x)
//!   - risk penalty  Risk(x)
//!
//! Noise-fragility note (Jarrett et al., 2022, arXiv:2211.10515): raw
//! prediction error is deliberately NOT the dominant term, to avoid "noisy TV"
//! traps where unpredictable-but-unlearnable stimuli soak up exploration.

'use strict';

// Internal clamp helper (kept local to avoid coupling curiosity to the survival policy module).
function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

const { deriveSurvivalState, detectPressures } = require('./survivalModelService');

const DEFAULT_WEIGHTS = Object.freeze({
  novelty: 0.15,
  informationGain: 0.15,
  learningProgress: 0.40,
  affordanceUncertainty: 0.15,
  cost: 0.075,
  risk: 0.075,
});

// ---------- small statistics helpers ----------

function mean(values) {
  if (!values.length) return 0;
  let sum = 0;
  for (const v of values) sum += Number(v) || 0;
  return sum / values.length;
}

// ---------- novelty ----------

function noveltyScore(domainRecord) {
  // Domain novelty decays with exposure count but never reaches 0.
  const seen = Number(domainRecord.seenCount || 0);
  return Math.max(0, Math.min(1, 1 / (1 + seen)));
}

// ---------- expected information gain (heuristic) ----------

function expectedInformationGain(domainRecord, predictionVariance) {
  // High variance + low familiarity ≈ potentially informative.
  const variance = clamp01(predictionVariance);
  const familiarity = clamp01(1 / (1 + Number(domainRecord.seenCount || 0)));
  return clamp01(variance * (0.5 + 0.5 * familiarity));
}

// ---------- learning progress ----------

function learningProgressScore(domainRecord) {
  const history = Array.isArray(domainRecord.errorHistory) ? domainRecord.errorHistory : [];
  if (history.length < 2) return 0;

  // Learning progress is positive when prediction error decreases over recent
  // observations. Use absolute error reduction as a stable signal; it does not
  // depend on error magnitude (avoids division by zero on brand-new domains).
  const recent = history.slice(-5).map((v) => Math.abs(Number(v) || 0));
  if (recent.length < 2) return 0;

  const first = recent[0];
  const last = recent[recent.length - 1];
  const errorReduction = Math.max(0, first - last);

  // Normalise by initial error to get a relative learning rate, but clamp
  // to avoid unrealistic values when first error is near zero.
  const learningRate = first > 0.01 ? errorReduction / first : errorReduction * 10;
  const rate = clamp01(learningRate);

  // Penalise domains that are already mastered (error already low): even if
  // error keeps dropping marginally, there is little room for further progress.
  const currentError = last;
  const mastery = clamp01(1 - currentError);
  const remainingPotential = 1 - mastery;

  // Learning progress is high when: error decreases AND there is room to improve.
  return clamp01(rate * remainingPotential);
}

// ---------- affordance uncertainty ----------

function affordanceUncertaintyScore(domainRecord) {
  const known = Number(domainRecord.knownAffordanceCount || 0);
  const tested = Number(domainRecord.testedAffordanceCount || 0);
  const total = Math.max(1, known + tested + (domainRecord.totalAffordanceCount || 0));
  const testedRatio = total > 0 ? tested / total : 1;
  return clamp01(1 - testedRatio);
}

// ---------- main curiosity computation ----------

function computeCuriosity(domainRecord, options = {}) {
  const weights = options.weights || DEFAULT_WEIGHTS;
  const {
    novelty: wN = DEFAULT_WEIGHTS.novelty,
    informationGain: wIG = DEFAULT_WEIGHTS.informationGain,
    learningProgress: wLP = DEFAULT_WEIGHTS.learningProgress,
    affordanceUncertainty: wA = DEFAULT_WEIGHTS.affordanceUncertainty,
    cost: wC = DEFAULT_WEIGHTS.cost,
    risk: wR = DEFAULT_WEIGHTS.risk,
  } = weights;

  const N = noveltyScore(domainRecord);
  const IG = expectedInformationGain(
    domainRecord,
    Number(options.predictionVariance ?? domainRecord.predictionVariance ?? 0)
  );
  const LP = learningProgressScore(domainRecord);
  // L'incertitude d'affordance n'est pertinente que si le domaine est
  // apprenable (LP > 0) : sinon on risque d'explorer des noise TV.
  const A = LP > 0.01
    ? affordanceUncertaintyScore(domainRecord)
    : affordanceUncertaintyScore(domainRecord) * 0.15;
  const cost = clamp01(Number(options.cost ?? domainRecord.cost ?? 0));
  const risk = clamp01(Number(options.risk ?? domainRecord.risk ?? 0));

  const raw = N * wN + IG * wIG + LP * wLP + A * wA - cost * wC - risk * wR;
  return Math.max(0, Math.min(1, raw));
}

// ---------- domain ledger ----------

function updateDomainAfterObservation(domainRecord, outcome) {
  const record = Object.assign({}, domainRecord || {});
  record.seenCount = (Number(record.seenCount || 0) + 1);
  const err = Number(outcome?.predictionError ?? outcome?.error ?? 0);
  record.errorHistory = Array.isArray(record.errorHistory)
    ? [...record.errorHistory.slice(-49), err] // keep bounded history
    : [err];
  record.lastObservationAt = new Date().toISOString();
  if (outcome?.affordanceId) {
    record.testedAffordanceCount = (Number(record.testedAffordanceCount || 0) + 1);
  }
  return record;
}

function recordDomainInteraction(domainRecord, interaction) {
  // Called when an agent *tries* something in a domain (play, exploration, experiment).
  const record = Object.assign({}, domainRecord || {});
  record.interactionCount = (Number(record.interactionCount || 0) + 1);
  record.lastInteractionAt = new Date().toISOString();
  if (interaction?.affordanceId) {
    record.knownAffordanceCount = (Number(record.knownAffordanceCount || 0) + 1);
  }
  return record;
}

// ---------- active curiosity routing ----------

function rankDomains(domains, context, weights) {
  const list = Array.isArray(domains) ? domains : [];
  return list
    .map((domain) => ({
      domainId: domain.domainId || domain.id || 'unknown',
      curiosity: computeCuriosity(domain, { ...context, weights }),
      domain,
    }))
    .sort((a, b) => b.curiosity - a.curiosity);
}

module.exports = {
  DEFAULT_WEIGHTS,
  noveltyScore,
  expectedInformationGain,
  learningProgressScore,
  affordanceUncertaintyScore,
  computeCuriosity,
  updateDomainAfterObservation,
  recordDomainInteraction,
  rankDomains,
  mean,
};
