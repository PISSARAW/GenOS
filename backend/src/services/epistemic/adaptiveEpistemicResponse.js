'use strict';

const {
  scan: scanAntigen,
  innateFirstPass: quarantineDecision,
} = require('./innateEpistemicImmunity');

// ---- received-receipt helpers ----

const PASSED = new Set(['passed', 'approved', 'clean']);

function hasReceiptShape(receipt) {
  return receipt && typeof receipt === 'object'
    && receipt.resultId
    && receipt.evidenceDigest
    && receipt.verifierDigest;
}

function receiptLooksIndependent(receipt) {
  return receipt && receipt.independent === true && PASSED.has(receipt.status);
}

function independentReceipt(receipt) {
  return receiptLooksIndependent(receipt) && hasReceiptShape(receipt);
}

function receiptMatchesResult(receipt, resultId, evidenceDigest) {
  if (!independentReceipt(receipt)) return false;
  return receipt.resultId === resultId && receipt.evidenceDigest === evidenceDigest;
}

function hasIndependentReceipt(receipts = [], resultId, evidenceDigest) {
  return receipts.some((r) => receiptMatchesResult(r, resultId, evidenceDigest));
}

// ---- provenance guardrails ----

function getProvenance(antigen) {
  if (!antigen || typeof antigen !== 'object') return null;
  return antigen.epitopes && antigen.epitopes.provenance || null;
}

const SELFDECLARE_KINDS = new Set(['self', 'internal']);

function provKindMatchesSelf(prov) {
  if (!prov || !prov.kind) return false;
  return SELFDECLARE_KINDS.has(prov.kind);
}

function provActorSaysSelf(prov) {
  return prov.actor && prov.actor.toLowerCase().includes('self');
}

function provLocatorSaysSelf(prov) {
  return prov.locator && prov.locator.toLowerCase().includes('self');
}

function isSelfVerificationContext(antigen) {
  const prov = getProvenance(antigen);
  if (!prov) return false;
  if (!prov.kind && !prov.locator) return false;
  return provKindMatchesSelf(prov) || provActorSaysSelf(prov) || provLocatorSaysSelf(prov);
}

function isLowProvenance(antigen) {
  const prov = getProvenance(antigen);
  if (!prov) return false;
  if (!prov.locator && !prov.digest && prov.kind === 'internal') return true;
  if (!prov.locator && !prov.digest && prov.kind === 'memory') return true;
  return false;
}

// ---- external claim ----

const EXTERNAL_CLAIM_HINTS = [
  'expert says',
  'étude montre',
  'source externe',
  'selon',
  'rapport',
  'preuve externe',
  'démonstration',
];

function hasExternalClaim(antigen) {
  if (!antigen || typeof antigen !== 'object') return false;
  const claim = (antigen.claim || '').toLowerCase();
  const hintFound = EXTERNAL_CLAIM_HINTS.some((s) => claim.includes(s));
  return hintFound && !isSelfVerificationContext(antigen);
}

// ---- automated proof detection ----

function isAutomatedContent(content) {
  if (!content || typeof content !== 'object') return false;
  const kind = content.kind;
  if (kind === 'automated') return true;
  const gen = content.generator === 'auto';
  const ver = content.verifier === 'auto';
  if (gen || ver) return true;
  if (content.kind === 'proof' || content.kind === 'reproducible_artifact') {
    return gen || ver;
  }
  return false;
}

function isAutomatedProof(claim, evidence) {
  if (!evidence || typeof evidence !== 'object') return false;
  if (evidence.kind !== 'proof' && evidence.kind !== 'reproducible_artifact') return false;
  return isAutomatedContent(evidence.content);
}

// ---- adaptive signal catalogue ----

const SIGNAL_CHECKS = [
  {
    name: 'risk_elevé',
    test: (antigen) => Boolean(antigen.risk && antigen.risk.score >= 0.6),
  },
  {
    name: 'autoverification',
    test: isSelfVerificationContext,
  },
  {
    name: 'preuve_absente',
    test: (antigen) => {
      const e = antigen.epitopes && antigen.epitopes.evidence;
      return !e || !e.content;
    },
  },
  {
    name: 'provenance_faible',
    test: isLowProvenance,
  },
  {
    name: 'source_externe_non_vérifiée',
    test: (antigen, ctx) => Boolean(hasExternalClaim(antigen) && ctx.externalSourceNotVerified),
  },
  {
    name: 'preuve_automatique_à_valider',
    test: (antigen) => isAutomatedProof(antigen.claim, antigen.epitopes && antigen.epitopes.evidence),
  },
  {
    name: 'hypothèses_multiples',
    test: (antigen) => {
      const a = antigen.epitopes && antigen.epitopes.assumptions;
      return Boolean(Array.isArray(a) && a.length > 4);
    },
  },
  {
    name: 'déjà_en_quarantaine',
    test: (antigen, ctx) => ctx.state === 'quarantine',
  },
];

function neededSignals(antigen, context) {
  const signals = SIGNAL_CHECKS
    .filter((check) => check.test(antigen, context))
    .map((check) => check.name);
  return signals.length > 0 ? signals : null;
}

// ---- trigger score ----

const TRIGGER_WEIGHTS = Object.freeze({
  risk_elevé: 0.15,
  autoverification: 0.25,
  preuve_absente: 0.2,
  provenance_faible: 0.15,
  source_externe_non_vérifiée: 0.2,
  preuve_automatique_à_valider: 0.15,
  hypothèses_multiples: 0.1,
});

function baseRiskContribution(antigen) {
  if (!antigen.risk || typeof antigen.risk.score !== 'number') return 0;
  return antigen.risk.score * 0.5;
}

function signalScore(shaped) {
  let score = baseRiskContribution(shaped._antigen || shaped.antigen);
  for (const name of shaped.signals) {
    score += TRIGGER_WEIGHTS[name] || 0;
  }
  return Math.min(score, 1.0);
}

function adaptiveTriggerScore(antigen, context = {}) {
  const signals = neededSignals(antigen, context) || [];
  const shaped = { antigen, _antigen: antigen, signals };
  return signalScore(shaped);
}

// ---- orchestration ----

function adaptiveCheck(antigen, context = {}) {
  const innate = quarantineDecision(antigen);
  const signals = neededSignals(antigen, context) || [];
  const triggerScore = adaptiveTriggerScore(antigen, context);
  const shouldTriggerAdaptive = triggerScore >= 0.4;
  const innateDecision = innate.decision || {};
  return {
    innate: {
      signals: innate.innate.signals,
      totalDanger: innate.innate.totalDanger,
      dangerLevel: innate.innate.dangerLevel,
      decision: innateDecision,
    },
    adaptive: {
      triggered: shouldTriggerAdaptive,
      signals,
      triggerScore,
      reason: shouldTriggerAdaptive ? 'besoin de vérification adaptative' : 'niveau acceptable',
    },
    decision: shouldTriggerAdaptive
      ? 'adaptive'
      : (innateDecision.action === 'neutralize' ? 'neutralize' : innateDecision.action),
  };
}

function selectVerifierAssignments(signals) {
  const assignments = [];
  if (signals.includes('autoverification') || signals.includes('source_externe_non_vérifiée')) {
    assignments.push({ type: 'contre_vérification', verifier: 'indépendant' });
  }
  if (signals.includes('preuve_absente') || signals.includes('preuve_automatique_à_valider')) {
    assignments.push({ type: 'vérification_preuve', verifier: 'preuve_indépendante' });
  }
  if (signals.includes('provenance_faible')) {
    assignments.push({ type: 'vérification_origine', verifier: 'provenance' });
  }
  if (signals.includes('hypothèses_multiples')) {
    assignments.push({ type: 'audit_hypothèses', verifier: 'hypothèses' });
  }
  if (assignments.length === 0) {
    assignments.push({ type: 'vérification_générale', verifier: 'général' });
  }
  return assignments;
}

function adaptiveResponse(evaluation, verifierCatalog = {}, context = {}) {
  if (!evaluation.adaptive.triggered) {
    return { status: 'pas_de_réponse_adaptative', next: null };
  }
  const signals = evaluation.adaptive.signals || [];
  return {
    status: 'adaptation_demanding',
    verifierAssignments: selectVerifierAssignments(signals),
    next: 'adaptive_quarantine',
  };
}

module.exports = {
  independentReceipt,
  receiptMatchesResult,
  hasIndependentReceipt,
  isAutomatedProof,
  isSelfVerificationContext,
  isLowProvenance,
  hasExternalClaim,
  needsAdaptiveResponse: neededSignals,
  adaptiveTriggerScore,
  adaptiveCheck,
  adaptiveResponse,
  scanAntigen: require('./innateEpistemicImmunity').scan,
  quarantineDecision: require('./innateEpistemicImmunity').innateFirstPass,
  DANGER_PATTERNS: require('./dangerSignals').DANGER_PATTERNS,
  patternByName: require('./dangerSignals').patternByName,
  filterByAction: require('./dangerSignals').filterByAction,
  filterByCategory: require('./dangerSignals').filterByCategory,
  dangerScore: require('./dangerSignals').dangerScore,
};
