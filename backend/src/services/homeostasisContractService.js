'use strict';

const crypto = require('crypto');

const HOMEOSTASIS_SCHEMA = 'genos.homeostasis/v1alpha1';

const FUNCTIONAL = 'functional';
const STRUCTURAL = 'structural';
const EPISTEMIC = 'epistemic';
const SAFETY = 'safety';

const INVARIANT_CLASSES = Object.freeze([FUNCTIONAL, STRUCTURAL, EPISTEMIC, SAFETY]);

// Declarative verifier catalog: an invariant persists as a reference into this
// catalog, never as a closure. A persisted contract stays replayable after a
// backend restart because the verifier is resolved by id at evaluation time.
const VERIFIER_CATALOG = Object.freeze({
  'context.flag': {
    description: 'Boolean flag present and true in the evaluation context (context.flags[flag])',
    build: (spec) => (ctx) => Boolean(ctx && ctx.flags && ctx.flags[spec.flag] === true)
  },
  'context.flag_false': {
    description: 'Boolean flag present and false in the evaluation context (context.flags[flag])',
    build: (spec) => (ctx) => Boolean(ctx && ctx.flags && ctx.flags[spec.flag] === false)
  },
  'context.path_equals': {
    description: 'Deep equality on a context path (spec.path against spec.expected)',
    build: (spec) => (ctx) => resolvePath(ctx, spec.path) === spec.expected
  },
  'context.list_empty': {
    description: 'List at a context path is empty or absent',
    build: (spec) => (ctx) => {
      const value = resolvePath(ctx, spec.path);
      return Array.isArray(value) ? value.length === 0 : true;
    }
  },
  'evidence.present': {
    description: 'Required evidence kind is present in context.evidence (a Set or array of kinds)',
    build: (spec) => (ctx) => evidencePresent(ctx, spec.evidence)
  },
  'mission.outcome_success': {
    description: 'Mission outcome reported success (context.missionOutcome === true)',
    build: () => (ctx) => Boolean(ctx && ctx.missionOutcome === true)
  }
});

function resolvePath(source, pathSpec) {
  if (!pathSpec) return undefined;
  const parts = Array.isArray(pathSpec) ? pathSpec : String(pathSpec).split('.');
  let current = source;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function evidencePresent(ctx, evidenceKind) {
  if (!ctx || !ctx.evidence) return false;
  if (ctx.evidence instanceof Set) return ctx.evidence.has(evidenceKind);
  if (Array.isArray(ctx.evidence)) return ctx.evidence.includes(evidenceKind);
  if (typeof ctx.evidence === 'object') return ctx.evidence[evidenceKind] === true;
  return false;
}

function invariantId() {
  return `inv_${crypto.randomUUID()}`;
}

function invariantClass(value) {
  if (value && INVARIANT_CLASSES.includes(value)) return value;
  throw new Error(`Unknown invariant class '${value}'. Allowed: ${INVARIANT_CLASSES.join(', ')}`);
}

function resolveVerifier(input = {}) {
  if (typeof input.check === 'function') return input.check;
  const spec = input.verifier || {};
  const entry = VERIFIER_CATALOG[spec.type];
  if (!entry) {
    throw new Error(`Unknown verifier type '${spec.type}'. Known: ${Object.keys(VERIFIER_CATALOG).join(', ')}`);
  }
  return entry.build(spec);
}

function buildInvariant(input = {}) {
  return {
    id: input.id || invariantId(),
    kind: invariantClass(input.kind || input.class || FUNCTIONAL),
    label: input.label || null,
    verifier: input.verifier || null,
    check: resolveVerifier(input),
    satisfied: false,
    lastEvaluationAt: null,
    evaluation: null
  };
}

function buildHomeostasisContract(input = {}) {
  const invariants = (input.invariants || []).map(i => buildInvariant(i));
  const requiredEvidence = Array.isArray(input.requiredEvidence) ? input.requiredEvidence.slice() : [];
  const minimumFunctionalCoverage = Number.isFinite(input.minimumFunctionalCoverage)
    ? input.minimumFunctionalCoverage
    : 1;
  return {
    id: input.id || `homeostasis_${crypto.randomUUID()}`,
    missionId: input.missionId || null,
    invariants,
    requiredEvidence,
    minimumFunctionalCoverage,
    assembledAt: new Date().toISOString()
  };
}

function serializeInvariant(invariant) {
  return {
    id: invariant.id,
    kind: invariant.kind,
    label: invariant.label,
    verifier: invariant.verifier
  };
}

function serializeContract(contract) {
  return {
    id: contract.id,
    missionId: contract.missionId,
    invariants: contract.invariants.map(serializeInvariant),
    requiredEvidence: contract.requiredEvidence,
    minimumFunctionalCoverage: contract.minimumFunctionalCoverage,
    assembledAt: contract.assembledAt
  };
}

function deserializeContract(payload = {}) {
  return buildHomeostasisContract({
    id: payload.id,
    missionId: payload.missionId,
    invariants: (payload.invariants || []).map(i => ({ ...i, check: resolveVerifier(i) })),
    requiredEvidence: payload.requiredEvidence,
    minimumFunctionalCoverage: payload.minimumFunctionalCoverage,
    assembledAt: payload.assembledAt
  });
}

function evaluateInvariant(invariant, context) {
  let satisfied = false;
  let evaluation = null;
  try {
    evaluation = invariant.check(context);
    satisfied = Boolean(evaluation);
  } catch (error) {
    evaluation = { error: error.message || String(error) };
    satisfied = false;
  }
  invariant.satisfied = satisfied;
  invariant.evaluation = evaluation;
  invariant.lastEvaluationAt = new Date().toISOString();
  return { invariant, satisfied };
}

function evaluateRequiredEvidence(contract, context) {
  const required = contract.requiredEvidence || [];
  const missing = required.filter((kind) => !evidencePresent(context, kind));
  return {
    required,
    missing,
    satisfied: missing.length === 0
  };
}

function evaluateContract(contract, context) {
  const results = contract.invariants.map(inv => evaluateInvariant(inv, context));
  const evidence = evaluateRequiredEvidence(contract, context);
  const functionalSatisfied = results.filter(r => r.invariant.kind === FUNCTIONAL && r.satisfied).length;
  const functionalRequired = contract.invariants.filter(i => i.kind === FUNCTIONAL).length || 1;
  const functionalRatio = functionalSatisfied / functionalRequired;
  const totalSatisfied = results.filter(r => r.satisfied).length;
  const invariantsSatisfied = results.length > 0 && totalSatisfied === results.length;
  return {
    schema: HOMEOSTASIS_SCHEMA,
    missionId: contract.missionId,
    evaluatedAt: new Date().toISOString(),
    totalInvariants: results.length,
    satisfiedInvariants: totalSatisfied,
    ratio: results.length > 0 ? totalSatisfied / results.length : 0,
    functionalSatisfied,
    functionalRequired,
    functionalRatio,
    functionalMinCoverageMet: functionalRatio >= contract.minimumFunctionalCoverage,
    evidence,
    classSatisfaction: {
      functional: results.filter(r => r.invariant.kind === FUNCTIONAL && r.satisfied).length,
      structural: results.filter(r => r.invariant.kind === STRUCTURAL && r.satisfied).length,
      epistemic: results.filter(r => r.invariant.kind === EPISTEMIC && r.satisfied).length,
      safety: results.filter(r => r.invariant.kind === SAFETY && r.satisfied).length
    },
    failedInvariants: results.filter(r => !r.satisfied).map(r => ({
      id: r.invariant.id,
      kind: r.invariant.kind,
      label: r.invariant.label,
      evaluation: r.invariant.evaluation
    })),
    homeostasisSatisfied: invariantsSatisfied && evidence.satisfied
  };
}

function homeostasisStatus(result) {
  if (!result || typeof result !== 'object') return 'unknown';
  if (result.homeostasisSatisfied) return 'homeostasis_satisfied';
  if (!result.evidence.satisfied) return 'evidence_missing';
  if (result.functionalMinCoverageMet) return 'partially_stable';
  if (result.classSatisfaction.safety < result.classSatisfaction.functional) return 'unsafe';
  return 'unstable';
}

module.exports = {
  HOMEOSTASIS_SCHEMA,
  INVARIANT_CLASSES,
  FUNCTIONAL,
  STRUCTURAL,
  EPISTEMIC,
  SAFETY,
  VERIFIER_CATALOG,
  invariantId,
  invariantClass,
  resolveVerifier,
  buildInvariant,
  buildHomeostasisContract,
  serializeContract,
  deserializeContract,
  evaluateInvariant,
  evaluateRequiredEvidence,
  evaluateContract,
  homeostasisStatus
};