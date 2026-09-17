'use strict';

const {
  CLAIM_TYPES,
  EVIDENCE_KINDS,
  validateClaim,
  evidenceQuality,
} = require('./epistemic/core');
const { validateClaimAgainstRules } = require('./epistemic/validator');

const UNKNOWN_TRUTH = 'unknown';
const TRUTH_VALUES = Object.freeze([true, false, UNKNOWN_TRUTH]);

function requireClaim(claim) {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) {
    throw new Error('knowledgeService requires a claim object.');
  }
  return claim;
}

function normalizeTruthValue(value) {
  if (value === true || value === false) return value;
  if (typeof value === 'string' && value.toLowerCase() === UNKNOWN_TRUTH) return UNKNOWN_TRUTH;
  return UNKNOWN_TRUTH;
}

function evidenceSummary(claim) {
  const evidence = Array.isArray(claim.evidence) ? claim.evidence : [];
  return {
    count: evidence.length,
    kinds: evidence.map((entry) => entry?.kind).filter((kind) => Object.values(EVIDENCE_KINDS).includes(kind)),
    hasPayload: evidence.some((entry) => entry && typeof entry === 'object' && Object.values(entry).some(Boolean)),
  };
}

function assessBelief({ claim }) {
  requireClaim(claim);
  const validation = validateClaim(claim);
  const present = typeof claim.statement === 'string' && claim.statement.trim().length > 0;
  const held = present && [CLAIM_TYPES.BELIEF, CLAIM_TYPES.FACTUAL].includes(claim.type);
  return {
    present,
    held,
    type: claim.type || null,
    statement: claim.statement || null,
    provisional: claim.type === CLAIM_TYPES.BELIEF,
    validClaimShape: validation.valid,
    errors: validation.errors,
  };
}

function assessTruth({ claim, truthValue = UNKNOWN_TRUTH, truthSource = null }) {
  requireClaim(claim);
  const value = normalizeTruthValue(truthValue);
  return {
    value,
    status: value === UNKNOWN_TRUTH ? 'undetermined' : 'declared',
    source: truthSource || 'caller-input',
    verified: false,
    note: value === UNKNOWN_TRUTH
      ? 'La vérité de la proposition n’est pas établie par cette analyse.'
      : 'La valeur de vérité est une donnée d’entrée ; elle n’est pas inférée des preuves du claim.',
  };
}

function assessJustification({ claim, stakes, tails }) {
  requireClaim(claim);
  const shape = validateClaim(claim);
  const validation = validateClaimAgainstRules(claim, { stakes, tails });
  const evidence = evidenceSummary(claim);
  const quality = evidenceQuality(claim);
  return {
    valid: shape.valid && evidence.count > 0 && validation.verdict !== 'reject',
    evidence,
    quality,
    calibratedConfidence: validation.calibratedConfidence,
    verdict: validation.verdict,
    reasons: [...shape.errors, ...validation.reasons],
    justifiedBy: evidence.kinds,
  };
}

function knowledgeStatus({ belief, truth, justification }) {
  if (!belief.held) return 'not-a-held-belief';
  if (truth.value === false) return 'false-belief';
  if (truth.value === UNKNOWN_TRUTH) return 'truth-undetermined';
  if (!justification.valid) return 'true-belief-without-justification';
  return 'knowledge-candidate';
}

function analyzeKnowledge(args = {}) {
  const claim = requireClaim(args.claim);
  const belief = assessBelief({ claim });
  const truth = assessTruth({ claim, truthValue: args.truthValue, truthSource: args.truthSource });
  const justification = assessJustification({ claim, stakes: args.stakes, tails: args.tails });
  const status = knowledgeStatus({ belief, truth, justification });
  return {
    claimId: claim.id || null,
    status,
    belief,
    truth,
    justification,
    tripartite: {
      belief: belief.held,
      truth: truth.value === true,
      justification: justification.valid,
      satisfied: belief.held && truth.value === true && justification.valid,
    },
    limitation: 'Un cas Gettier, la chance épistémique et la fiabilité causale ne sont pas décidés par cette analyse.',
  };
}

module.exports = {
  UNKNOWN_TRUTH,
  TRUTH_VALUES,
  assessBelief,
  assessTruth,
  assessJustification,
  analyzeKnowledge,
};
