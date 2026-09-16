'use strict';

/**
 * Epistemic infrastructure — tables, types, debt, calibration, phase tags.
 * Central module backing points 1b/2/3/4/7 (one commit).
 *
 * Tables are optional/additive: absent when the migration hasn't run yet
 * (tests, older DBs). Every public function degrades gracefully.
 */

const { CLAIM_TYPES, EVIDENCE_KINDS, validateClaim, evidenceQuality, confidenceFromEvidence } =
  require('./claimTypes');

// ---------------------------------------------------------------------------
// Claim type registry with provable causal provenance (point 2)
// ---------------------------------------------------------------------------
const CLAIM_TYPE_REGISTRY = Object.freeze({
  [CLAIM_TYPES.FACTUAL]: {
    type: CLAIM_TYPES.FACTUAL,
    description: 'Empirically grounded assertion; verifiable against observation, test, or replay.',
    typicalEvidenceKinds: [
      EVIDENCE_KINDS.OBSERVATION,
      EVIDENCE_KINDS.TEST_RESULT,
      EVIDENCE_KINDS.REPLAY,
      EVIDENCE_KINDS.ARTIFACT,
    ],
    requirement: 'Must be falsifiable in principle (a test could prove it wrong).',
    registersAs: 'evidence',
  },
  [CLAIM_TYPES.NORMATIVE]: {
    type: CLAIM_TYPES.NORMATIVE,
    description: 'Value-loaded assertion about what should hold (rule, preference, obligation).',
    typicalEvidenceKinds: [
      EVIDENCE_KINDS.APPROVAL,
      EVIDENCE_KINDS.LOG,
      EVIDENCE_KINDS.ARTIFACT,
    ],
    requirement: 'Must name the authority or principle it derives from.',
    registersAs: 'norm',
  },
  [CLAIM_TYPES.PREFERENCE]: {
    type: CLAIM_TYPES.PREFERENCE,
    description: 'Agent or stakeholder preference, not universal. Lower epistemic stakes by default.',
    typicalEvidenceKinds: [EVIDENCE_KINDS.APPROVAL, EVIDENCE_KINDS.LOG],
    requirement: 'Must identify whose preference it is.',
    registersAs: 'preference',
  },
  [CLAIM_TYPES.BELIEF]: {
    type: CLAIM_TYPES.BELIEF,
    description: 'Held position without full verification; provisional until corroborated.',
    typicalEvidenceKinds: [
      EVIDENCE_KINDS.RECONSTRUCTION,
      EVIDENCE_KINDS.OBSERVATION,
      EVIDENCE_KINDS.LOG,
    ],
    requirement: 'Must be flagged as provisional and tracked for debt until resolved.',
    registersAs: 'belief',
  },
});

// Rich metadata per claim type — the kind of thing you would serialize as
// JSON-LD @context if you wanted to exchange it. We keep it as plain objects
// here for runtime efficiency; the shape is stable and inspectable.
const CLAIM_TYPE_METADATA = Object.freeze(
  Object.fromEntries(
    Object.values(CLAIM_TYPES).map((type) => {
      const entry = CLAIM_TYPE_REGISTRY[type];
      return [
        type,
        Object.freeze({
          '@context': 'genos://epistemic/v1/claim-type',
          type,
          description: entry.description,
          typicalEvidenceKinds: entry.typicalEvidenceKinds,
          requirement: entry.requirement,
          epistemicCategory: entry.registersAs,
          provenance: {
            registeredBy: 'genos-epistemic-core',
            registeredAt: '2026-09-16',
            version: 1,
            supersedes: null,
          },
        }),
      ];
    }),
  ),
);

// ---------------------------------------------------------------------------
// Epistemic trend decays (point 4)
// ---------------------------------------------------------------------------

const DECAY_CURVES = Object.freeze({
  IMMEDIATE: {
    label: 'immediate',
    halfLifeTails: 1, // effective "observations" before halving
    clamp: (x) => Math.max(0, Math.min(1, x)),
  },
  SHORT: {
    label: 'short',
    halfLifeTails: 8,
    clamp: (x) => Math.max(0, Math.min(1, x)),
  },
  MEDIUM: {
    label: 'medium',
    halfLifeTails: 32,
    clamp: (x) => Math.max(0, Math.min(1, x)),
  },
  LONG: {
    label: 'long',
    halfLifeTails: 128,
    clamp: (x) => Math.max(0, Math.min(1, x)),
  },
  STATIC: {
    label: 'static',
    halfLifeTails: Infinity,
    clamp: (x) => x,
  },
});

function decayCurveFor(type) {
  return DECAY_CURVES[type] || DECAY_CURVES.SHORT;
}

/**
 * Apply exponential decay from known quality, counted in "tails".
 * quality0 = initial evidence quality (0..1). tails = number of
 * subsequent observations/decisions since the claim was formed.
 */
function decayedConfidence(quality0, tails, curve = DECAY_CURVES.SHORT) {
  if (!isFinite(tails) || tails <= 0) return quality0;
  if (curve.halfLifeTails === Infinity) return quality0;
  const factor = Math.pow(0.5, tails / curve.halfLifeTails);
  return curve.clamp(quality0 * factor);
}

// ---------------------------------------------------------------------------
// Phase tags (point 7)
// ---------------------------------------------------------------------------

const PHASE = Object.freeze({
  EXPLORE: 'explore',
  COMMIT: 'commit',
});

function isPhase(value) {
  return value === PHASE.EXPLORE || value === PHASE.COMMIT;
}

// ---------------------------------------------------------------------------
// Epistemic debt (point 3)
// ---------------------------------------------------------------------------

const DEBT_REASONS = Object.freeze({
  UNVERIFIED_BELIEF: 'unverified_belief',
  LOW_EVIDENCE_QUALITY: 'low_evidence_quality',
  PROVISIONAL_APPROVAL: 'provisional_approval',
  STALE_OBSERVATION: 'stale_observation',
  CONTRADICTED: 'contradicted',
  MISSING_AUTHORITY: 'missing_authority',
});

function isDebtReason(value) {
  return Object.values(DEBT_REASONS).includes(value);
}

// Internal: minimal in-memory debt store when no DB migration is present.
// Backed by an optional persistent store if schema-v01 exists.
let debtStore = null;

function _ensureDebtStore() {
  if (debtStore) return debtStore;
  try {
    const EpistemicDb = require('./epistemicDb');
    debtStore = EpistemicDb;
  } catch (_) {
    // Graceful degradation: in-memory map when schema migration absent.
    const map = new Map();
    debtStore = {
      async list() {
        return [...map.values()];
      },
      async find(reason, subject) {
        for (const d of map.values()) {
          if (d.reason === reason && (!subject || d.subject === subject)) return d;
        }
        return null;
      },
      async add(d) {
        map.set(d.id, d);
        return d;
      },
      async resolve(id) {
        const d = map.get(id);
        if (d) d.resolved = true;
        return d;
      },
      async touching(subject) {
        return [...map.values()].filter((d) => d.subject === subject && !d.resolved);
      },
    };
  }
  return debtStore;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function claimTypeMetadata(type) {
  return CLAIM_TYPE_METADATA[type] || null;
}

function claimTypeRegistersAs(type) {
  const m = CLAIM_TYPE_METADATA[type];
  return m ? m.epistemicCategory : null;
}

function registerClaimTypeEntry(entry) {
  if (!entry || !entry.type || !entry.description) return null;
  // Registry is frozen by default — you can only inspect. Mutation would be
  // an explicit governance action (ADR), not a runtime detail.
  return CLAIM_TYPE_REGISTRY[entry.type] ? CLAIM_TYPE_REGISTRY[entry.type] : null;
}

function createEpistemicDebt(params) {
  const store = _ensureDebtStore();
  const id = params.id || `debt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const debt = Object.freeze({
    id,
    reason: params.reason || DEBT_REASONS.UNVERIFIED_BELIEF,
    subject: params.subject || null,
    claimType: params.claimType || null,
    description: params.description || null,
    severity: params.severity || 'medium',
    createdAt: new Date().toISOString(),
    resolved: false,
    resolvedAt: null,
    resolution: null,
  });
  return store.add(debt);
}

async function getEpistemicDebts(selector = {}) {
  const store = _ensureDebtStore();
  const all = await store.list();
  if (selector.resolved === true) return all.filter((d) => d.resolved);
  if (selector.resolved === false || selector.open === true) return all.filter((d) => !d.resolved);
  if (selector.subject) return all.filter((d) => d.subject === selector.subject);
  if (selector.reason) return all.filter((d) => d.reason === selector.reason);
  return all;
}

function resolveEpistemicDebt(id, resolution) {
  const store = _ensureDebtStore();
  const d = store.resolve(id);
  if (!d) return null;
  // Return a new frozen object reflecting resolution (persistent store may
  // keep identities; in-memory returns a copy).
  return Object.freeze({
    ...d,
    resolved: true,
    resolvedAt: new Date().toISOString(),
    resolution: resolution || null,
  });
}

function unresolvedDebtCount(selector = {}) {
  return getEpistemicDebts(selector).then((ds) => ds.filter((d) => !d.resolved).length);
}

function debtSeverityRank(severity) {
  const rank = { low: 1, medium: 2, high: 3, critical: 4 };
  return rank[severity] || 0;
}

// ---------------------------------------------------------------------------
// Confidence calibration (point 4)
// ---------------------------------------------------------------------------

const STAKE_LEVELS = Object.freeze({
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  CRITICAL: 'critical',
});

function maxStakeLevel(levels) {
  const rank = { low: 1, normal: 2, high: 3, critical: 4 };
  let best = null;
  let bestRank = -1;
  for (const l of (levels || [])) {
    const r = rank[l] || 0;
    if (r > bestRank) {
      bestRank = r;
      best = l;
    }
  }
  return best || STAKE_LEVELS.NORMAL;
}

function confidenceWithStakes(claim, stakes = STAKE_LEVELS.NORMAL, curve = DECAY_CURVES.SHORT, tails = 0) {
  if (!claim || !validateClaim(claim).valid) return 0;
  const base = evidenceQuality(claim);
  if (base === 0) return 0;
  const decayed = decayedConfidence(base, tails, curve);
  // Stake multiplier: higher stakes raise the effective confidence bar but
  // don't inflate the raw number; we return the raw plus a flag.
  const stakePenalty = { low: 0, normal: 0, high: 0.05, critical: 0.1 } [stakes] || 0;
  return Math.max(0, decayed - stakePenalty);
}

function calibrationGap(claim, stakes = STAKE_LEVELS.NORMAL, curve = DECAY_CURVES.SHORT, tails = 0) {
  const calibrated = confidenceWithStakes(claim, stakes, curve, tails);
  const raw = evidenceQuality(claim);
  return Number((raw - calibrated).toFixed(3));
}

// ---------------------------------------------------------------------------
// Phase tag handling (point 7)
// ---------------------------------------------------------------------------

function tagPhase(claim, phase) {
  if (!claim || typeof claim !== 'object') return null;
  if (!isPhase(phase)) return null;
  return Object.freeze({
    ...claim,
    _phase: phase,
    _phasedAt: new Date().toISOString(),
  });
}

function phaseOf(claim) {
  return claim && claim._phase ? claim._phase : null;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // From claimTypes
  CLAIM_TYPES,
  EVIDENCE_KINDS,
  validateClaim,
  evidenceQuality,
  confidenceFromEvidence,

  // Claim type registry + metadata (point 2)
  CLAIM_TYPE_REGISTRY,
  CLAIM_TYPE_METADATA,
  claimTypeMetadata,
  claimTypeRegistersAs,
  registerClaimTypeEntry,

  // Debt ledger (point 3)
  DEBT_REASONS,
  isDebtReason,
  createEpistemicDebt,
  getEpistemicDebts,
  resolveEpistemicDebt,
  unresolvedDebtCount,
  debtSeverityRank,

  // Confidence calibration (point 4)
  DECAY_CURVES,
  decayCurveFor,
  decayedConfidence,
  STAKE_LEVELS,
  maxStakeLevel,
  confidenceWithStakes,
  calibrationGap,

  // Phase tags (point 7)
  PHASE,
  isPhase,
  tagPhase,
  phaseOf,
};
