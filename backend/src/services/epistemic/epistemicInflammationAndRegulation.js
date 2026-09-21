'use strict';

/**
 * Epistemic inflammation + tolerance / T-reg.
 *
 * Dynamique homéostatique : le niveau d effort (baseline / lean / adaptive /
 * inflamed / systemic) découle de la pression homéostatique, et les
 * régulateurs inhibent les rejets injustifiés (sur-vérification, dogme,
  * rejet automatique de nouveauté).
 */

const h = require('./epistemicHomeostasisService');
const { recall, fuzzyRecall } = require('./immuneMemoryService');

function assignPressureTier(input, homeostasisInput) {
  const pressure = h.computePressure(homeostasisInput || input);
  const tier = h.tierFromPressure(pressure);
  return { pressure, tier, homeostasisInput };
}

function inflammationLevel(tier, extraSignals = 0) {
  const table = {
    baseline: 'baseline',
    lean: extraSignals >= 2 ? 'lean_inflamed' : 'lean',
    adaptive: extraSignals >= 2 ? 'inflamed' : 'adaptive',
    inflamed: 'inflamed',
    systemic: 'systemic',
  };
  return table[tier] || tier;
}

function shouldInflameTier(tier) {
  return tier === 'systemic' || tier === 'inflamed';
}

function shouldInflame(tier, adaptiveTriggered, contradictionCount = 0) {
  if (shouldInflameTier(tier)) return true;
  if (tier === 'adaptive' && (adaptiveTriggered || contradictionCount > 0)) return true;
  return false;
}

function recommendedEffort(tier, inflation) {
  const base = {
    baseline: ['innate_only'],
    lean: ['innate', 'light_adaptive'],
    adaptive: ['innate', 'adaptive_verifier'],
    lean_inflamed: ['innate', 'adaptive_verifier', 'counterexample_worker'],
    inflamed: ['innate', 'adaptive_verifier', 'counterexample_worker', 'independent_verifier'],
    systemic: ['innate', 'adaptive_verifier', 'replay', 'source_verification', 'human_escalation'],
  };
  return base[inflation] || base[tier] || base.baseline;
}

// ---- tolérance épistémique ----

function isNovelClaim(antigen, memory) {
  if (!antigen || !antigen.claim) return true;
  const memo = recall(memory, antigen);
  return !memo;
}

function isJustifiedRejection(reason) {
  const unjustified = new Set([
    'aucune source externe',
    'revendication inhabituelle',
    'pas de web citation',
    'source locale non reconnue',
    'revendication nouvelle',
  ]);
  return !unjustified.has(reason);
}

// ---- régulateur (T-reg épistémique) ----

function inhibit(reason, signal) {
  return { inhibit: true, reason, suppressedSignal: signal, action: 'inhibit_rejection' };
}

function inhibitionReason(antigen, rejectionReason, context = {}) {
  const unjustified = !isJustifiedRejection(rejectionReason);
  const novel = isNovelClaim(antigen, context.immuneMemory);
  if (unjustified && novel) return 'régulateur: rejet injustifié sur revendication inhabituelle';
  const selfVerified = antigen && antigen.epitopes && antigen.epitopes.provenance && antigen.epitopes.provenance.selfVerified;
  if (selfVerified && novel) return 'régulateur: autoverification + nouveauté non douteuse';
  if (unjustified && context.knownSubject) return 'régulateur: revendication connue, suspicion de sur-vérification';
  return null;
}

function regulatoryReview(antigen, rejectionReason, context = {}) {
  if (!rejectionReason) return null;
  const reason = inhibitionReason(antigen, rejectionReason, context);
  if (reason) return inhibit(reason, rejectionReason);
  return { inhibit: false, reason: 'régulateur: rejet autorisé', action: 'allow_rejection' };
}

module.exports = {
  assignPressureTier,
  inflammationLevel,
  shouldInflame,
  recommendedEffort,
  isNovelClaim,
  isJustifiedRejection,
  regulatoryReview,
};
