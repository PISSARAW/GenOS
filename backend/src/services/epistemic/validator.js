'use strict';

/**
 * Validation-supervised epistemic controller.
 *
 * Point 5 — Validation before acceptance:
 * Every claim entering the system must be validated against knowledge
 * boundaries (typed evidence, consistency, stake level) BEFORE it is
 * accepted into the decision stream. The validator returns a verdict +
 * reason, never a silent accept.
 */

const {
  validateClaim,
  evidenceQuality,
  confidenceFromEvidence,
  CLAIM_TYPES,
  EVIDENCE_KINDS,
  DECAY_CURVES,
  decayedConfidence,
  STAKE_LEVELS,
  maxStakeLevel,
  confidenceWithStakes,
  calibrationGap,
  PHASE,
  tagPhase,
  phaseOf,
  createEpistemicDebt,
  getEpistemicDebts,
  resolveEpistemicDebt,
  unresolvedDebtCount,
} = require('./core');

// ---------------------------------------------------------------------------
// Validation rules
// ---------------------------------------------------------------------------

const RULE_LEVELS = Object.freeze({
  MANDATORY: 'mandatory',
  ADVISORY: 'advisory',
  HINT: 'hint',
});

const VALIDATION_RULES = Object.freeze([
  {
    id: 'evidence-present',
    level: RULE_LEVELS.MANDATORY,
    appliesTo: [CLAIM_TYPES.FACTUAL, CLAIM_TYPES.BELIEF],
    check: (claim) => Array.isArray(claim.evidence) && claim.evidence.length > 0,
    why: 'Factual and belief claims must carry typed evidence.',
  },
  {
    id: 'evidence-typed',
    level: RULE_LEVELS.MANDATORY,
    appliesTo: [CLAIM_TYPES.FACTUAL, CLAIM_TYPES.BELIEF, CLAIM_TYPES.NORMATIVE],
    check: (claim) =>
      Array.isArray(claim.evidence) &&
      claim.evidence.every((ev) => ev && typeof ev.kind === 'string'),
    why: 'Every evidence entry must declare its kind.',
  },
  {
    id: 'no-raw-confidence',
    level: RULE_LEVELS.MANDATORY,
    appliesTo: [CLAIM_TYPES.FACTUAL, CLAIM_TYPES.BELIEF],
    check: (claim) => claim.confidence === undefined || claim.confidence === null,
    why: 'Raw confidence floats are not accepted; confidence must be derived from evidence quality.',
  },
  {
    id: 'claim-type-declared',
    level: RULE_LEVELS.MANDATORY,
    appliesTo: true, // all types
    check: (claim) => typeof claim.type === 'string',
    why: 'Every claim must declare its type.',
  },
  {
    id: 'normative-has-authority',
    level: RULE_LEVELS.ADVISORY,
    appliesTo: [CLAIM_TYPES.NORMATIVE],
    check: (claim) => !!(claim.authority || claim.source),
    why: 'Normative claims should name their authority or source.',
  },
  {
    id: 'belief-flagged-provisional',
    level: RULE_LEVELS.MANDATORY,
    appliesTo: [CLAIM_TYPES.BELIEF],
    check: (claim) => !!(claim.provisional === true || claim.provisional === undefined),
    why: 'Belief claims must be treated as provisional unless they carry proof of resolution.',
  },
  {
    id: 'probability-is-real',
    level: RULE_LEVELS.MANDATORY,
    appliesTo: [CLAIM_TYPES.FACTUAL],
    check: (claim) =>
      claim.probability === undefined ||
      (typeof claim.probability === 'number' && isFinite(claim.probability) && claim.probability >= 0 && claim.probability <= 1),
    why: 'If probability is supplied, it must be a real number in [0,1].',
  },
]);

// ---------------------------------------------------------------------------
// Verdict type
// ---------------------------------------------------------------------------

const VERDICT = Object.freeze({
  ACCEPT: 'accept',
  REJECT: 'reject',
  REQUIRES_DEBT: 'requires_debt', // accepted but creates epistemic debt
  QUARANTINE: 'quarantine', // held until clarification
});

function isVerdict(value) {
  return Object.values(VERDICT).includes(value);
}

// ---------------------------------------------------------------------------
// Single-rule check
// ---------------------------------------------------------------------------

function applyRule(rule, claim) {
  const passes = rule.check(claim);
  return {
    ruleId: rule.id,
    level: rule.level,
    passes,
    why: passes ? undefined : rule.why,
  };
}

// ---------------------------------------------------------------------------
// Validation of a single claim
// ---------------------------------------------------------------------------

function validateClaimAgainstRules(claim, opts = {}) {
  if (!claim || typeof claim !== 'object') {
    return {
      verdict: VERDICT.REJECT,
      reasons: ['claim is not a valid object'],
      evidenceQuality: 0,
      calibratedConfidence: 0,
    };
  }

  const evidenceCheck = validateClaim(claim);
  const failures = [];
  const appliedRules = [];

  // Type guard
  if (!CLAIM_TYPES[claim.type] && !Object.values(CLAIM_TYPES).includes(claim.type)) {
    failures.push(`unrecognized claim type: ${claim.type}`);
  }

  for (const rule of VALIDATION_RULES) {
    if (rule.appliesTo !== true && !rule.appliesTo.includes(claim.type)) continue;
    const result = applyRule(rule, claim);
    appliedRules.push(result);
    if (!result.passes) {
      failures.push(result.why);
    }
  }

  const hasMandatoryFailure = appliedRules.some(
    (r) => r.level === RULE_LEVELS.MANDATORY && !r.passes,
  );

  const evQuality = evidenceQuality(claim);
  const stakes = opts.stakes || STAKE_LEVELS.NORMAL;
  const curve = opts.decayCurve || DECAY_CURVES.SHORT;
  const tails = opts.tails || 0;
  const calibrated = confidenceWithStakes(claim, stakes, curve, tails);

  let verdict;
  if (evidenceCheck.valid === false || hasMandatoryFailure) {
    verdict = VERDICT.REJECT;
  } else if (claim.type === CLAIM_TYPES.BELIEF && evQuality < 0.5) {
    verdict = VERDICT.REQUIRES_DEBT;
  } else if (evQuality < 0.3) {
    verdict = VERDICT.QUARANTINE;
  } else {
    verdict = VERDICT.ACCEPT;
  }

  return {
    verdict,
    reasons: failures,
    appliedRules: appliedRules.map((r) => ({ ruleId: r.ruleId, level: r.level, passes: r.passes })),
    evidenceQuality: evQuality,
    calibratedConfidence: calibrated,
    calibrationGap: calibrationGap(claim, stakes, curve, tails),
    stakes,
  };
}

// ---------------------------------------------------------------------------
// Claim acceptance gate (central entry point for decision stream)
// ---------------------------------------------------------------------------

function acceptClaim(claim, opts = {}) {
  const validation = validateClaimAgainstRules(claim, opts);
  const debtCreated = [];

  if (validation.verdict === VERDICT.ACCEPT) {
    return {
      accepted: true,
      claim: claim,
      validation,
      debt: [],
    };
  }

  if (validation.verdict === VERDICT.REQUIRES_DEBT) {
    const debt = createEpistemicDebt({
      reason: 'unverified_belief',
      subject: claim.id || claim.type,
      claimType: claim.type,
      description: `Belief claim accepted with low evidence quality (${validation.evidenceQuality.toFixed(2)}).`,
      severity: validation.evidenceQuality < 0.2 ? 'high' : 'medium',
    });
    debtCreated.push(debt);
    return {
      accepted: true,
      claim: claim,
      validation,
      debt: [debt],
      noted: 'Accepted but epistemic debt created.',
    };
  }

  if (validation.verdict === VERDICT.QUARANTINE) {
    return {
      accepted: false,
      claim: claim,
      validation,
      debt: [],
      reason: 'Quarantined: evidence quality too low for acceptance.',
    };
  }

  return {
    accepted: false,
    claim: claim,
    validation,
    debt: [],
    reason: 'Rejected: validation rule failure.',
  };
}

// ---------------------------------------------------------------------------
// Batch with grouping by verdict
// ---------------------------------------------------------------------------

function acceptClaimBatch(claims, opts = {}) {
  const results = claims.map((c) => acceptClaim(c, opts));
  const byVerdict = {
    [VERDICT.ACCEPT]: [],
    [VERDICT.REQUIRES_DEBT]: [],
    [VERDICT.QUARANTINE]: [],
    [VERDICT.REJECT]: [],
  };
  for (const r of results) {
    byVerdict[r.validation.verdict].push(r);
  }
  return {
    results,
    summary: {
      accepted: byVerdict[VERDICT.ACCEPT].length + byVerdict[VERDICT.REQUIRES_DEBT].length,
      rejected: byVerdict[VERDICT.REJECT].length,
      quarantined: byVerdict[VERDICT.QUARANTINE].length,
    },
  };
}

// ---------------------------------------------------------------------------
// Epistemic debt reconciliation
// ---------------------------------------------------------------------------

async function reconcileEpistemicDebts(selector = {}) {
  const debts = await getEpistemicDebts(selector);
  const open = debts.filter((d) => !d.resolved);
  const resolved = debts.filter((d) => d.resolved);
  return { total: debts.length, open: open.length, resolved: resolved.length, debts };
}

async function autoResolveStakeableDebts(claim, stakes) {
  const debts = await getEpistemicDebts({ subject: claim.id || claim.type });
  const resolved = [];
  for (const d of debts) {
    if (d.resolved) continue;
    if (claim.type === CLAIM_TYPES.FACTUAL || claim.type === CLAIM_TYPES.NORMATIVE) {
      const r = resolveEpistemicDebt(d.id, `Resolved by claim of type ${claim.type} at stakes ${stakes}.`);
      if (r) resolved.push(r);
    }
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Consistency checks across claims (point 2 auxiliary)
// ---------------------------------------------------------------------------

function checkClaimConsistency(claims) {
  // Simple pairwise check: two factual claims with the same subject field and
  // contradictory probability must be flagged.
  const issues = [];
  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i];
      const b = claims[j];
      if (
        a.type === CLAIM_TYPES.FACTUAL &&
        b.type === CLAIM_TYPES.FACTUAL &&
        a.subject === b.subject &&
        a.probability !== undefined &&
        b.probability !== undefined
      ) {
        if (Math.abs(a.probability - b.probability) > 0.5) {
          issues.push({
            type: 'contradictory_probability',
            subject: a.subject,
            claims: [a.id || i, b.id || j],
            gap: Math.abs(a.probability - b.probability),
          });
        }
      }
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  RULE_LEVELS,
  VALIDATION_RULES,
  VERDICT,
  isVerdict,
  applyRule,
  validateClaimAgainstRules,
  acceptClaim,
  acceptClaimBatch,
  reconcileEpistemicDebts,
  autoResolveStakeableDebts,
  checkClaimConsistency,
};
